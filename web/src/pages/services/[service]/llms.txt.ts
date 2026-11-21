import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  getServicesList,
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

export const GET: APIRoute = async ({ props, site }) => {
  const { serviceInfo, entries } = props as { serviceInfo: ServiceInfo; entries: FeedEntry[] };
  const siteUrl = (site ? site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

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
    `## Recent Changes (${entries.length} tracked, ${serviceInfo.breakingCount} breaking)`,
    '',
  ];

  for (const entry of entries.slice(0, 30)) {
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

