import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  serializeLlmsEntryLines,
} from '../lib/feed';

export const GET: APIRoute = async (context) => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
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
    '## Recent API Changes and Breaking Updates',
    '',
  ];

  for (const entry of entries.slice(0, 30)) {
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
