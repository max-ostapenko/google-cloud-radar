import type { APIRoute } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

export const GET: APIRoute = async () => {
  const entries = await getAllFeedEntries();

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

  for (const entry of entries.slice(0, 30)) {
    lines.push(`### [${entry.date}] ${entry.service} (${entry.api})${entry.breaking ? ' [⚠️ BREAKING]' : ''}`);
    lines.push(`- **Title:** ${entry.title}`);
    lines.push(`- **Impact:** ${entry.impact} (Score: ${entry.interesting_score}/10)`);
    lines.push(`- **Summary:** ${entry.summary}`);
    if (entry.extractedMethods.length > 0) {
      lines.push(`- **Methods:** ${entry.extractedMethods.join(', ')}`);
    }
    lines.push(`- [View Full Change Diff & Details](https://google-cloud-radar.com/changes/${entry.slug})`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
};
