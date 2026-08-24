import type { APIRoute } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

export const GET: APIRoute = async () => {
  const entries = await getAllFeedEntries();

  const lines = [
    '# Google Cloud Radar (llms.txt)',
    '> Pre-release intelligence and real-time API specifications for Google APIs and Cloud services.',
    '',
    '## About',
    'Google Cloud Radar continuously monitors and diffs Google Discovery Service documents via GitHub Actions and Gemini.',
    'It captures breaking changes, parameter deprecations, and newly deployed control plane methods before they reach official release notes.',
    '',
    '## Repository',
    'https://github.com/max-ostapenko/discovery-artifact-manager',
    '',
    '## Recent API Changes and Breaking Updates',
    '',
  ];

  for (const entry of entries.slice(0, 30)) {
    lines.push(`### [${entry.date}] ${entry.service} (${entry.api})${entry.breaking ? ' [⚠️ BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
    lines.push(`- **Permalink:** https://gcp-cloud-radar.web.app/changes/${entry.slug}`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
};
