import type { APIRoute } from 'astro';
import {
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  formatMachineFeedEntryDetails,
  getAllFeedEntries,
  parseLimitParam,
} from '../lib/feed';

export const GET: APIRoute = async (context) => {
  const reqUrl = context?.url ?? (context?.request?.url ? new URL(context.request.url) : null);
  const impact = reqUrl?.searchParams.get('impact');
  const breaking = reqUrl?.searchParams.get('breaking');
  const service = reqUrl?.searchParams.get('service');
  const api = reqUrl?.searchParams.get('api');
  const since = reqUrl?.searchParams.get('since');
  const limitParam = reqUrl?.searchParams.get('limit');

  const limit = parseLimitParam(limitParam, 30) ?? 30;

  const rawEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const filteredEntries = filterFeedEntries(rawEntries, {
    impact,
    breaking,
    service,
    api,
    since,
  });

  const entries = filteredEntries.slice(0, limit);

  const lines = [
    '# Google Cloud Radar',
    '> Pre-release intelligence and real-time API specifications for Google APIs and Cloud services.',
    '',
    '## About',
    'Google Cloud Radar continuously monitors and diffs Google Discovery Service documents via GitHub Actions and Gemini.',
    'It captures breaking changes, parameter deprecations, and newly deployed API methods before they reach official release notes.',
    '',
    '## Documentation & Endpoints',
    '- [GitHub Repository](https://github.com/max-ostapenko/google-cloud-radar): Open-source project repository and issue tracker',
    '- [Breaking Changes Stream](https://google-cloud-radar.com/?impact=breaking): Dedicated backward-incompatible API triage filter',
    '- [API Velocity Benchmark](https://google-cloud-radar.com/stats): Rolling 90-day GCP velocity rankings and canary lead times',
    '',
    '## Recent API Changes and Breaking Updates',
    '',
  ];

  for (const entry of entries) {
    lines.push(`### [${entry.date}] ${entry.service} (${entry.api})${entry.breaking ? ' [⚠️ BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods && entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
    lines.push(...formatMachineFeedEntryDetails(entry));
    lines.push(`- [View Full Change Diff & Details](https://google-cloud-radar.com/changes/${entry.slug})`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
