/**
 * Writes LLM-generated API insights as structured JSON documents to data/changes/
 * and maintains data/index.json as a chronological manifest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findServiceMeta } from './taxonomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data');
export const DEFAULT_CHANGES_DIR = path.join(DEFAULT_DATA_DIR, 'changes');
export const DEFAULT_INDEX_PATH = path.join(DEFAULT_DATA_DIR, 'index.json');

export const INTERESTING_SCORE_THRESHOLD = 3;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function makeSlug(api: string, insightDate: string): string {
  return `${insightDate}-${slugify(api)}`;
}

export function loadIndex(indexPath = DEFAULT_INDEX_PATH): any[] {
  if (fs.existsSync(indexPath)) {
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {
      console.warn('data/index.json is malformed — starting fresh');
    }
  }
  return [];
}

export function saveIndex(entries: any[], indexPath = DEFAULT_INDEX_PATH): void {
  fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export function getRecentFeedEntries(
  api: string,
  insightDate: string,
  maxEntries = 3,
  dataDir = DEFAULT_DATA_DIR
): [string | null, any[]] {
  const indexPath = path.join(dataDir, 'index.json');
  const changesDir = path.join(dataDir, 'changes');

  const index = loadIndex(indexPath);
  const apiEntries = index.filter((e) => e.api === api);
  if (apiEntries.length === 0) {
    return [null, []];
  }

  apiEntries.sort((a, b) => {
    const da = `${a.date || ''}-${a.slug || a.id || ''}`;
    const db = `${b.date || ''}-${b.slug || b.id || ''}`;
    return db.localeCompare(da);
  });

  let existingTodayContent: string | null = null;
  const recentHistory: any[] = [];

  for (const entry of apiEntries) {
    const entryDate = entry.date;
    const slug = entry.slug || entry.id;
    if (!slug || !entryDate) continue;

    const jsonPath = path.join(changesDir, `${slug}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    try {
      const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const summary = doc.summary || '';
      const details = doc.details || '';
      const contentStr = `Summary: ${summary}\n\nDetails: ${details}`;
      const extractedMethods = doc.extracted_methods || [];
      const targetPaths = doc.target_paths || doc.extracted_paths || doc.target_schema_paths || [];

      if (entryDate === insightDate) {
        existingTodayContent = contentStr;
      } else if (recentHistory.length < maxEntries) {
        recentHistory.push({
          date: entryDate,
          slug,
          content: contentStr,
          extracted_methods: extractedMethods,
          target_paths: targetPaths,
        });
      }
    } catch (err: any) {
      console.warn(`Failed to read data file ${jsonPath}:`, err.message);
    }
  }

  return [existingTodayContent, recentHistory];
}

export function writeInsight(
  insight: Record<string, any>,
  insightDate?: string,
  dataDir = DEFAULT_DATA_DIR
): string | null {
  const score = insight.interesting_score ?? 0;
  const api = insight.api || 'unknown';
  const isBreaking = Boolean(insight.breaking);

  // Breaking changes always get published regardless of score, because a dropped
  // breaking alert is worse than a noisy feed entry (insight 530514db).
  if (!isBreaking && score < INTERESTING_SCORE_THRESHOLD) {
    console.info(`  Skipping ${api} (interesting_score=${score} < ${INTERESTING_SCORE_THRESHOLD}, non-breaking)`);
    return null;
  }

  const resolvedDate = insightDate || new Date().toISOString().slice(0, 10);
  const changesDir = path.join(dataDir, 'changes');
  const indexPath = path.join(dataDir, 'index.json');

  fs.mkdirSync(changesDir, { recursive: true });

  const baseSlug = makeSlug(api, resolvedDate);
  const filePath = path.join(changesDir, `${baseSlug}.json`);
  const finalSlug = baseSlug;

  const apiId = api ? api.split('.')[0].toLowerCase() : '';
  const canonicalMeta = findServiceMeta(apiId) || findServiceMeta(insight.service_name || insight.service || '');
  const serviceName = canonicalMeta?.name || insight.service_name || insight.service || 'Google Cloud';
  const title = insight.title || `${serviceName} API Update`;
  const summary = insight.summary || '';
  const details = insight.details || summary;
  const impact = String(insight.impact || 'low').toLowerCase();
  const breaking = Boolean(insight.breaking);
  let tags = insight.tags || [];
  if (typeof tags === 'string') tags = [tags];

  let extractedMethods = insight.extracted_methods || [];
  if (extractedMethods.length === 0) {
    const combined = `${summary} ${details}`;
    const matches = combined.match(/`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`/g) || [];
    extractedMethods = Array.from(new Set(matches.map((m) => m.slice(1, -1)))).slice(0, 6);
  }

  const targetPaths = insight.target_paths || insight.extracted_paths || [];

  const entry = {
    id: finalSlug,
    date: resolvedDate,
    api,
    service: serviceName,
    title,
    summary,
    details,
    impact,
    breaking,
    interesting_score: score,
    tags,
    extracted_methods: extractedMethods,
    target_paths: targetPaths,
    status: 'canary',
    lead_time_days: null,
    generated_at: new Date().toISOString(),
  };

  const isUpdate = fs.existsSync(filePath);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');

  console.info(`  ${isUpdate ? 'Updated' : 'Written'}: ${filePath} (score=${score})`);

  // Update index
  const index = loadIndex(indexPath);
  const indexEntry = {
    id: finalSlug,
    date: resolvedDate,
    api,
    service: serviceName,
    title,
    summary,
    impact,
    breaking,
    interesting_score: score,
    tags,
    extracted_methods: extractedMethods,
    target_paths: targetPaths,
    generated_at: entry.generated_at,
  };

  let replaced = false;
  for (let i = 0; i < index.length; i++) {
    if (index[i].id === finalSlug || index[i].slug === finalSlug) {
      index[i] = indexEntry;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    index.push(indexEntry);
  }

  index.sort((a, b) => {
    const da = `${a.date || ''}-${a.id || a.slug || ''}`;
    const db = `${b.date || ''}-${b.id || b.slug || ''}`;
    return db.localeCompare(da);
  });
  saveIndex(index, indexPath);

  return finalSlug;
}

export function writeInsights(
  insights: Array<Record<string, any>>,
  insightDate?: string,
  dataDir = DEFAULT_DATA_DIR
): string[] {
  const written: string[] = [];
  for (const insight of insights) {
    const slug = writeInsight(insight, insightDate, dataDir);
    if (slug) {
      written.push(slug);
    }
  }
  return written;
}
