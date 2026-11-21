import type { APIRoute } from 'astro';
import { deduplicateFeedSiblingVersions, getAllFeedEntries, getServicesList } from '../lib/feed';

const BASE_URL = 'https://google-cloud-radar.com';

export const GET: APIRoute = async ({ request }) => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const services = await getServicesList();

  const url = request?.url ? new URL(request.url) : new URL(`${BASE_URL}/llms.txt`);
  const pageParam = url.searchParams.get('page');
  const limitParam = url.searchParams.get('limit');

  let activeEntries = entries;
  let isPaginated = false;
  let page = 1;
  let limit = 50;
  let totalPages = 1;

  if (pageParam && pageParam.toLowerCase() !== 'all') {
    isPaginated = true;
    const parsedPage = parseInt(pageParam, 10);
    page = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 50;
    }

    totalPages = Math.max(1, Math.ceil(entries.length / limit));
    const start = (page - 1) * limit;
    activeEntries = entries.slice(start, start + limit);
  }

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
    `- [Breaking Changes Stream](${BASE_URL}/?impact=breaking): Dedicated backward-incompatible API triage filter`,
    `- [API Velocity Benchmark](${BASE_URL}/stats): Rolling 90-day GCP velocity rankings and canary lead times`,
    `- [Paginated LLM Stream](${BASE_URL}/llms.txt?page=1): Paginated change history stream for AI agents (supports ?page=N&limit=50)`,
    '',
    '## Machine-Readable Service Feeds & Endpoints',
    `- [Global RSS Feed](${BASE_URL}/rss.xml): Standard RSS 2.0 feed of all GCP API updates`,
    `- [Global Atom Feed](${BASE_URL}/atom.xml): Atom 1.0 feed of all GCP API updates`,
    `- [Global JSON Feed](${BASE_URL}/api/feed.json): JSON Feed 1.1 specification format`,
    `- [Velocity Stats JSON](${BASE_URL}/api/stats.json): Rolling 90-day GCP velocity metrics and benchmarks`,
  ];

  for (const svc of services) {
    lines.push(
      `- [${svc.service} Feed](${BASE_URL}/services/${svc.slug}): Monitored service route (LLM Context: ${BASE_URL}/services/${svc.slug}/llms.txt, JSON Feed: ${BASE_URL}/services/${svc.slug}/feed.json, RSS: ${BASE_URL}/services/${svc.slug}/rss.xml, Atom: ${BASE_URL}/services/${svc.slug}/atom.xml)`
    );
  }

  lines.push('');

  if (isPaginated) {
    lines.push(`## API Changes and Breaking Updates (Page ${page} of ${totalPages} - ${entries.length} Total Changes)`);
  } else {
    lines.push(`## Recent API Changes and Breaking Updates (${entries.length} Total Changes)`);
  }
  lines.push('');

  for (const entry of activeEntries) {
    lines.push(`### [${entry.date}] ${entry.service} (${entry.api})${entry.breaking ? ' [⚠️ BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods && entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
    lines.push(`- [View Full Change Diff & Details](${BASE_URL}/changes/${entry.slug})`);
    lines.push('');
  }

  if (isPaginated) {
    lines.push('## Stream Pagination Links');
    lines.push(`- [First Page](${BASE_URL}/llms.txt?page=1&limit=${limit})`);
    if (page > 1) {
      lines.push(`- [Previous Page](${BASE_URL}/llms.txt?page=${page - 1}&limit=${limit})`);
    }
    if (page < totalPages) {
      lines.push(`- [Next Page](${BASE_URL}/llms.txt?page=${page + 1}&limit=${limit})`);
    }
    lines.push(`- [Last Page](${BASE_URL}/llms.txt?page=${totalPages}&limit=${limit})`);
    lines.push(`- [Full Unpaginated Stream](${BASE_URL}/llms.txt?page=all)`);
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
