import type { APIRoute } from 'astro';
import { getAllFeedEntries, getServicesList, slugify, type FeedEntry, type ServiceInfo } from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = await getAllFeedEntries();

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

export const GET: APIRoute = async ({ props }) => {
  const { serviceInfo, entries } = props as { serviceInfo: ServiceInfo; entries: FeedEntry[] };

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
    `## Recent Changes (${entries.length} tracked, ${serviceInfo.breakingCount} breaking)`,
    '',
  ];

  for (const entry of entries.slice(0, 30)) {
    lines.push(`### [${entry.date}] ${entry.api}${entry.breaking ? ' [BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
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

