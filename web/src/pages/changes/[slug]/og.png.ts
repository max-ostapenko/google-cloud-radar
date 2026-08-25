import type { APIRoute } from 'astro';
import { getAllFeedEntries, type FeedEntry } from '../../../lib/feed';

export async function getStaticPaths() {
  const entries = await getAllFeedEntries();
  return entries.map((entry) => ({
    params: { slug: entry.slug },
    props: { entry },
  }));
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as FeedEntry;

  const title = escapeXml(entry.title || `${entry.service} Update`);
  const service = escapeXml(entry.service || 'Google Cloud');
  const api = escapeXml(entry.api || '');
  const date = escapeXml(entry.date || '');
  const category = escapeXml(entry.category || 'Core');
  const summary = escapeXml(
    (entry.summary || '').slice(0, 160) + ((entry.summary || '').length > 160 ? '...' : '')
  );

  const isBreaking = entry.breaking;
  const isReleased = entry.status === 'released';
  const leadTime = entry.lead_time_days ? `(${entry.lead_time_days}d Lead Time)` : '';

  const statusText = isReleased ? `RELEASED ${leadTime}` : 'CANARY (Unpublished)';
  const statusColor = isReleased ? '#188038' : '#e37400';
  const statusBg = isReleased ? 'rgba(24, 128, 56, 0.2)' : 'rgba(227, 116, 0, 0.2)';

  const methods = (entry.extractedMethods || []).slice(0, 3);
  const methodChips = methods
    .map(
      (m, i) =>
        `<g transform="translate(${60 + i * 360}, 490)">
          <rect width="340" height="38" rx="8" fill="#1e1f20" stroke="#3c4043" stroke-width="1.5" />
          <text x="12" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="#8ab4f8">RPC</text>
          <text x="50" y="24" font-family="'Roboto Mono', monospace" font-size="13" fill="#e8eaed">${escapeXml(m.length > 32 ? m.slice(0, 30) + '..' : m)}</text>
        </g>`
    )
    .join('');

  const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#131314" />
      <stop offset="50%" stop-color="#1b1c1d" />
      <stop offset="100%" stop-color="#0f1011" />
    </linearGradient>
    <linearGradient id="blueGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8ab4f8" />
      <stop offset="100%" stop-color="#4285f4" />
    </linearGradient>
    <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="#2d2f31" />
    </pattern>
  </defs>

  <!-- Dark Canvas -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  <rect width="1200" height="630" fill="url(#dotGrid)" />

  <!-- Outer Border Frame -->
  <rect x="20" y="20" width="1160" height="590" rx="20" fill="none" stroke="#2d2f31" stroke-width="2" />

  <!-- Brand Top Bar -->
  <g transform="translate(60, 60)">
    <!-- Google Colors Quad-Dots -->
    <circle cx="0" cy="12" r="6" fill="#4285f4" />
    <circle cx="16" cy="12" r="6" fill="#ea4335" />
    <circle cx="32" cy="12" r="6" fill="#fbbc04" />
    <circle cx="48" cy="12" r="6" fill="#34a853" />

    <text x="70" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff" letter-spacing="-0.3">
      Google Cloud Radar
    </text>
    <text x="290" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#80868b" letter-spacing="0.5">
      // PRE-RELEASE INTELLIGENCE
    </text>
  </g>

  <!-- Badges Row -->
  <g transform="translate(60, 125)">
    <!-- Service Pill -->
    <rect x="0" y="0" width="${service.length * 11 + 32}" height="32" rx="16" fill="rgba(66, 133, 244, 0.15)" stroke="#8ab4f8" stroke-width="1.5" />
    <text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#8ab4f8">${service}</text>

    <!-- Status Badge -->
    <g transform="translate(${service.length * 11 + 44}, 0)">
      <rect x="0" y="0" width="${statusText.length * 9.5 + 28}" height="32" rx="16" fill="${statusBg}" stroke="${statusColor}" stroke-width="1.5" />
      <circle cx="14" cy="16" r="4" fill="${statusColor}" />
      <text x="24" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${statusColor}">${statusText}</text>
    </g>

    ${
      isBreaking
        ? `<g transform="translate(${service.length * 11 + statusText.length * 9.5 + 84}, 0)">
            <rect x="0" y="0" width="165" height="32" rx="16" fill="rgba(234, 67, 53, 0.2)" stroke="#f28b82" stroke-width="1.5" />
            <text x="14" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="#f28b82">⚠️ BREAKING CHANGE</text>
          </g>`
        : ''
    }

    <text x="1060" y="21" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="14" fill="#9aa0a6">${date}</text>
  </g>

  <!-- Title (Multi-line wrap) -->
  <g transform="translate(60, 220)">
    <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="800" fill="#ffffff" letter-spacing="-0.8" line-height="1.2">
      ${title.length > 55 ? title.slice(0, 52) + '...' : title}
    </text>
  </g>

  <!-- Summary Paragraph -->
  <g transform="translate(60, 310)">
    <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="400" fill="#bdc1c6" width="1080">
      ${summary}
    </text>
  </g>

  <!-- Method Chips Row -->
  ${methodChips}

  <!-- Footer Branding -->
  <g transform="translate(60, 575)">
    <line x1="0" y1="-20" x2="1080" y2="-20" stroke="#2d2f31" stroke-width="1" />
    <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" fill="#80868b">
      Sourced from Google API Discovery Service • <tspan fill="#8ab4f8" font-weight="600">Google Cloud Radar</tspan>
    </text>
    <text x="1080" y="0" text-anchor="end" font-family="'Roboto Mono', monospace" font-size="14" font-weight="600" fill="#8ab4f8">
      https://google-cloud-radar.com
    </text>
  </g>
</svg>
  `.trim();

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
