/**
 * Orchestrator: extracts structured diffs, calls the LLM for each API,
 * and writes insights to the feed.
 *
 * Usage:
 *     npx tsx scripts/diff_to_feed.ts                  # normal run (HEAD~1..HEAD)
 *     npx tsx scripts/diff_to_feed.ts --dry-run         # print diffs only, no LLM/feed
 *     npx tsx scripts/diff_to_feed.ts --base <ref>      # compare against a specific ref
 */

import { extractStructuredDiffs, extractMethodIdentifiersFromPaths } from './diff_preprocessor.ts';
import { writeInsights, getRecentFeedEntries } from './feed_writer.ts';
import { analyzeApiDiff } from './llm_client.ts';

export function extractMethodAndPathMetadata(diff: Record<string, any>): [Set<string>, Set<string>] {
  const methods = new Set<string>();
  const paths = new Set<string>();

  if (Array.isArray(diff.extracted_methods)) {
    for (const m of diff.extracted_methods) methods.add(m.toLowerCase());
  }
  if (Array.isArray(diff.target_paths)) {
    for (const p of diff.target_paths) paths.add(p.toLowerCase());
  }

  if (methods.size === 0 || paths.size === 0) {
    const rawPaths = new Set<string>();
    for (const cat of ['added', 'removed', 'modified']) {
      for (const entry of diff[cat] || []) {
        if (entry.path) rawPaths.add(entry.path.toLowerCase());
      }
    }
    if (paths.size === 0) {
      for (const p of rawPaths) paths.add(p);
    }
    if (methods.size === 0) {
      const extracted = extractMethodIdentifiersFromPaths(rawPaths);
      for (const m of extracted) methods.add(m);
    }
  }

  return [methods, paths];
}

export function isDuplicateDiff(diff: Record<string, any>, recentHistory: any[]): [boolean, string] {
  if (!recentHistory || recentHistory.length === 0) {
    return [false, ''];
  }

  const [diffMethods, diffPaths] = extractMethodAndPathMetadata(diff);
  if (diffMethods.size === 0 && diffPaths.size === 0) {
    return [false, ''];
  }

  for (const entry of recentHistory) {
    const slug = entry.slug || '';
    const dateStr = entry.date || '';

    const histMethods = new Set<string>((entry.extracted_methods || []).map((m: string) => m.toLowerCase()));
    const rawHistPaths = entry.target_paths || entry.extracted_paths || entry.target_schema_paths || [];
    const histPaths = new Set<string>(rawHistPaths.map((p: string) => p.toLowerCase()));

    if (histPaths.size === 0 && histMethods.size === 0) {
      continue;
    }

    const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

    if (setsEqual(diffMethods, histMethods) && setsEqual(diffPaths, histPaths)) {
      return [
        true,
        `Identical method set (${[...diffMethods].sort().join(', ')}) and target path metadata (${[...diffPaths].sort().join(', ')}) match historical change ${slug} (${dateStr})`,
      ];
    }
  }

  return [false, ''];
}

export async function runDiffToFeed(options: {
  base?: string;
  head?: string;
  date?: string;
  dryRun?: boolean;
}): Promise<string[]> {
  const baseRef = options.base || 'HEAD';
  const headRef = options.head || 'WORKTREE';
  const insightDate = options.date || new Date().toISOString().slice(0, 10);

  const structuredDiffs = extractStructuredDiffs(baseRef, headRef);
  if (structuredDiffs.length === 0) {
    console.log('No meaningful API changes found — nothing to publish.');
    return [];
  }

  if (options.dryRun) {
    console.log(`\n============================================================`);
    console.log(`DRY RUN — ${structuredDiffs.length} structured diff(s):`);
    console.log(`============================================================\n`);
    for (const diff of structuredDiffs) {
      const stats = diff._stats;
      delete diff._stats;
      console.log(JSON.stringify(diff, null, 2));
      console.log(`  Stats:`, stats);
    }
    return [];
  }

  const insights: Array<Record<string, any>> = [];
  for (const diff of structuredDiffs) {
    const api = diff.api || 'unknown';
    const [existingTodayContent, recentHistory] = getRecentFeedEntries(api, insightDate);

    if (existingTodayContent) {
      console.log(`Found existing feed entry for ${api} today. Will request LLM merge.`);
    }

    if (recentHistory && recentHistory.length > 0) {
      const [isDup, reason] = isDuplicateDiff(diff, recentHistory);
      if (isDup) {
        console.log(`  Skipping ${api}: duplicate of recent historical change (${reason}).`);
        continue;
      }

      console.log(`Found ${recentHistory.length} recent historical feed entries for ${api}. Will pass as context.`);
    }

    const recentHistoryContent = recentHistory && recentHistory.length > 0
      ? recentHistory.map((h) => `--- Entry Date: ${h.date} (Slug: ${h.slug}) ---\n${h.content}`).join('\n\n')
      : null;

    const insight = await analyzeApiDiff(diff, existingTodayContent, recentHistoryContent);
    if (insight) {
      if (diff.is_breaking !== undefined) {
        insight.breaking = Boolean(diff.is_breaking);
      }
      const [methods, paths] = extractMethodAndPathMetadata(diff);
      insight.extracted_methods = Array.from(methods).sort();
      insight.target_paths = Array.from(paths).sort();
      insights.push(insight);
    } else {
      console.warn(`  No insight returned for ${api} (LLM unavailable or failed)`);
    }
  }

  if (insights.length === 0) {
    console.log('No insights generated — feed unchanged.');
    return [];
  }

  const written = writeInsights(insights, insightDate);
  if (written.length > 0) {
    console.log(`\nPublished ${written.length} insight(s) to data/:`);
    for (const slug of written) {
      console.log(`  data/changes/${slug}.json`);
    }
  } else {
    console.log('All insights were below the interesting_score threshold — feed unchanged.');
  }

  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx !== -1 ? args[baseIdx + 1] : 'HEAD';
  const headIdx = args.indexOf('--head');
  const head = headIdx !== -1 ? args[headIdx + 1] : 'WORKTREE';
  const dateIdx = args.indexOf('--date');
  const date = dateIdx !== -1 ? args[dateIdx + 1] : undefined;

  runDiffToFeed({ base, head, date, dryRun }).catch((err) => {
    console.error('Fatal diff_to_feed error:', err);
    process.exit(1);
  });
}
