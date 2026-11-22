import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  getAllFeedEntries,
  getServicesList,
  parseLimitParam,
  serializeLlmsEntryLines,
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
  const siteUrl = (context?.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');
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
    `- [Service Hub](${siteUrl}/services/${serviceInfo.slug})`,
    `- [JSON Feed](${siteUrl}/services/${serviceInfo.slug}/feed.json)`,
    `- [RSS Feed](${siteUrl}/services/${serviceInfo.slug}/rss.xml)`,
    `- [Atom Feed](${siteUrl}/services/${serviceInfo.slug}/atom.xml)`,
    '',
    `## Recent Changes (${rawEntries.length} tracked, ${serviceInfo.breakingCount} breaking)`,
    '',
  ];

  for (const entry of entries) {
    lines.push(
      ...serializeLlmsEntryLines(entry, {
        includeServiceInHeading: false,
        breakingBadgeText: 'BREAKING',
        diffLinkLabel: 'Full Change Diff',
        siteUrl,
      })
    );
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

