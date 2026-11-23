import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  getServicesList,
  serializeLlmsEntryLines,
} from '../lib/feed';

export const GET: APIRoute = async (context) => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const services = await getServicesList();
  const siteUrl = (context?.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

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
  lines.push(`## Recent API Changes and Breaking Updates (${entries.length} Total Changes)`);
  lines.push('');

  for (const entry of entries) {
    lines.push(
      ...serializeLlmsEntryLines(entry, {
        includeServiceInHeading: true,
        breakingBadgeText: '⚠️ BREAKING',
        diffLinkLabel: 'View Full Change Diff & Details',
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
