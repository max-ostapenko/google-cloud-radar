import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  getAllFeedEntries,
  getServicesList,
  parseLimitParam,
  serializeLlmsEntryLines,
} from '../lib/feed';

export const GET: APIRoute = async (context) => {
  const rawEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const services = await getServicesList();
  const siteUrl = (context?.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

  const url =
    context?.url ??
    (context?.request?.url ? new URL(context.request.url) : new URL(`${siteUrl}/llms.txt`));
  const impact = url.searchParams.get('impact');
  const breaking = url.searchParams.get('breaking');
  const service = url.searchParams.get('service');
  const api = url.searchParams.get('api');
  const since = url.searchParams.get('since');
  const pageParam = url.searchParams.get('page');
  const limitParam = url.searchParams.get('limit');

  const entries = filterFeedEntries(rawEntries, {
    impact,
    breaking,
    service,
    api,
    since,
  });

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
  } else if (limitParam && (!pageParam || pageParam.toLowerCase() !== 'all')) {
    const parsedLimit = parseLimitParam(limitParam);
    if (parsedLimit !== undefined) {
      activeEntries = entries.slice(0, parsedLimit);
    }
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
    `- [Breaking Changes Stream](${siteUrl}/?impact=breaking): Dedicated backward-incompatible API triage filter`,
    `- [API Velocity Benchmark](${siteUrl}/stats): Rolling 90-day GCP velocity rankings and canary lead times`,
    `- [Paginated LLM Stream](${siteUrl}/llms.txt?page=1): Paginated change history stream for AI agents (supports ?page=N&limit=50)`,
    '',
    '## Machine-Readable Service Feeds & Endpoints',
    `- [Global RSS Feed](${siteUrl}/rss.xml): Standard RSS 2.0 feed of all GCP API updates`,
    `- [Global Atom Feed](${siteUrl}/atom.xml): Atom 1.0 feed of all GCP API updates`,
    `- [Global JSON Feed](${siteUrl}/api/feed.json): JSON Feed 1.1 specification format`,
    `- [Velocity Stats JSON](${siteUrl}/api/stats.json): Rolling 90-day GCP velocity metrics and benchmarks`,
  ];

  for (const svc of services) {
    lines.push(
      `- [${svc.service} Feed](${siteUrl}/services/${svc.slug}): Monitored service route (LLM Context: ${siteUrl}/services/${svc.slug}/llms.txt, JSON Feed: ${siteUrl}/services/${svc.slug}/feed.json, RSS: ${siteUrl}/services/${svc.slug}/rss.xml, Atom: ${siteUrl}/services/${svc.slug}/atom.xml)`
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
    lines.push(
      ...serializeLlmsEntryLines(entry, {
        includeServiceInHeading: true,
        breakingBadgeText: '⚠️ BREAKING',
        diffLinkLabel: 'View Full Change Diff & Details',
        siteUrl,
      })
    );
  }

  if (isPaginated) {
    const filterQuery = new URLSearchParams();
    if (impact) filterQuery.set('impact', impact);
    if (breaking) filterQuery.set('breaking', breaking);
    if (service) filterQuery.set('service', service);
    if (api) filterQuery.set('api', api);
    if (since) filterQuery.set('since', since);
    const extraSuffix = filterQuery.toString() ? `&${filterQuery.toString()}` : '';

    lines.push('## Stream Pagination Links');
    lines.push(`- [First Page](${siteUrl}/llms.txt?page=1&limit=${limit}${extraSuffix})`);
    if (page > 1) {
      lines.push(`- [Previous Page](${siteUrl}/llms.txt?page=${page - 1}&limit=${limit}${extraSuffix})`);
    }
    if (page < totalPages) {
      lines.push(`- [Next Page](${siteUrl}/llms.txt?page=${page + 1}&limit=${limit}${extraSuffix})`);
    }
    lines.push(`- [Last Page](${siteUrl}/llms.txt?page=${totalPages}&limit=${limit}${extraSuffix})`);
    lines.push(`- [Full Unpaginated Stream](${siteUrl}/llms.txt?page=all${extraSuffix})`);
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
