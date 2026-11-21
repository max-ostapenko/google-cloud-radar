import type { APIRoute } from 'astro';
import {
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  formatMachineFeedEntryDetails,
  getAllFeedEntries,
  getServicesList,
  parseLimitParam,
  slugify,
  type FeedEntry,
  type ServiceInfo,
} from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());

  return services.map((svc) => {
    const serviceEntries = allEntries.filter(
      (e) => slugify(e.service) === svc.slug
    );
    return {
      params: { service: svc.slug },
      props: {
        serviceInfo: svc,
        entries: serviceEntries,
      },
    };
  });
}

export const GET: APIRoute = async (context) => {
  const { serviceInfo, entries: rawEntries } = context.props as { serviceInfo: ServiceInfo; entries: FeedEntry[] };
  const reqUrl = context?.url ?? (context?.request?.url ? new URL(context.request.url) : null);
  const impact = reqUrl?.searchParams.get('impact');
  const breaking = reqUrl?.searchParams.get('breaking');
  const api = reqUrl?.searchParams.get('api');
  const since = reqUrl?.searchParams.get('since');
  const limitParam = reqUrl?.searchParams.get('limit');
  const limit = parseLimitParam(limitParam, 30) ?? 30;

  const filteredEntries = filterFeedEntries(rawEntries, {
    impact,
    breaking,
    api,
    since,
  });

  const entries = filteredEntries.slice(0, limit);

  const lines = [
    `# ${serviceInfo.service} — Google Cloud Radar`,
    `> Pre-release intelligence and real-time Discovery API diffs for ${serviceInfo.service} (${serviceInfo.category}).`,
    '',
    '## Endpoints',
    `- [Service Hub](https://google-cloud-radar.com/services/${serviceInfo.slug})`,
    `- [JSON Feed](https://google-cloud-radar.com/services/${serviceInfo.slug}/feed.json)`,
    `- [RSS Feed](https://google-cloud-radar.com/services/${serviceInfo.slug}/rss.xml)`,
    `- [Atom Feed](https://google-cloud-radar.com/services/${serviceInfo.slug}/atom.xml)`,
    '',
    `## Recent Changes (${rawEntries.length} tracked, ${serviceInfo.breakingCount} breaking)`,
    '',
  ];

  for (const entry of entries) {
    lines.push(`### [${entry.date}] ${entry.api}${entry.breaking ? ' [BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods && entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
    lines.push(...formatMachineFeedEntryDetails(entry));
    lines.push(`- [Full Change Diff](https://google-cloud-radar.com/changes/${entry.slug})`);
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

