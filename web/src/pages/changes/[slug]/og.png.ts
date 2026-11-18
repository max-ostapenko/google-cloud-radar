import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { deduplicateFeedSiblingVersions, getAllFeedEntries, type FeedEntry } from '../../../lib/feed';

export async function getStaticPaths() {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
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

export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    if (word.length > maxChars) {
      word = word.slice(0, Math.max(1, maxChars - 3)) + '...';
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] =
          last.length > maxChars - 3 ? last.slice(0, maxChars - 3) + '...' : last.endsWith('...') ? last : `${last}...`;
        return lines;
      }
      current = word;
    }
  }

  if (current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length > maxChars - 3 ? last.slice(0, maxChars - 3) + '...' : last.endsWith('...') ? last : `${last}...`;
    }
  }

  return lines;
}

const SANS_FONT = "DejaVu Sans, Liberation Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO_FONT = "DejaVu Sans Mono, Liberation Mono, 'Roboto Mono', monospace";

export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as FeedEntry;

  const rawTitle = entry.title || `${entry.service} Update`;
  const rawService = entry.service || 'Google Cloud';
  const rawSummary = entry.summary || '';
  const date = escapeXml(entry.date || '');

  const isBreaking = entry.breaking;
  const isReleased = entry.status === 'released';
  const leadTime =
    entry.lead_time_days !== undefined && entry.lead_time_days !== null
      ? `(${entry.lead_time_days}d Lead Time)`
      : '';

  const statusText = isReleased ? `RELEASED ${leadTime}`.trim() : 'CANARY (Unpublished)';
  const statusColor = isReleased ? '#34a853' : '#fbbc04';
  const statusBg = isReleased ? 'rgba(52, 168, 83, 0.18)' : 'rgba(251, 188, 4, 0.16)';

  const serviceWidth = Math.max(96, Math.round(rawService.length * 9.5 + 34));
  const statusWidth = Math.max(120, Math.round(statusText.length * 8.6 + 38));
  const service = escapeXml(rawService);

  const titleLines = wrapText(rawTitle, 46, 2);
  const titleSvg = titleLines
    .map(
      (line, idx) =>
        `<tspan x="0" dy="${idx === 0 ? 0 : 46}">${escapeXml(line)}</tspan>`
    )
    .join('');

  const summaryY = titleLines.length > 1 ? 316 : 276;
  const summaryLines = wrapText(rawSummary, 84, 3);
  const summarySvg = summaryLines
    .map(
      (line, idx) =>
        `<tspan x="0" dy="${idx === 0 ? 0 : 30}">${escapeXml(line)}</tspan>`
    )
    .join('');

  const methods = (entry.extractedMethods || []).slice(0, 3);
  const methodChips = methods
    .map(
      (m, i) =>
        `<g transform="translate(${60 + i * 360}, 490)">
          <rect width="340" height="38" rx="8" fill="#1e1f20" stroke="#3c4043" stroke-width="1.5" />
          <text x="14" y="24" font-family="${SANS_FONT}" font-size="12" font-weight="700" fill="#8ab4f8">RPC</text>
          <text x="52" y="24" font-family="${MONO_FONT}" font-size="13" fill="#e8eaed">${escapeXml(m.length > 30 ? m.slice(0, 28) + '..' : m)}</text>
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
    <circle cx="0" cy="12" r="6" fill="#4285f4" />
    <circle cx="16" cy="12" r="6" fill="#ea4335" />
    <circle cx="32" cy="12" r="6" fill="#fbbc04" />
    <circle cx="48" cy="12" r="6" fill="#34a853" />

    <text x="70" y="18" font-family="${SANS_FONT}" font-size="20" font-weight="700" fill="#ffffff" letter-spacing="-0.3">
      Google Cloud Radar
    </text>
    <text x="290" y="18" font-family="${SANS_FONT}" font-size="14" font-weight="600" fill="#80868b" letter-spacing="0.5">
      // PRE-RELEASE INTELLIGENCE
    </text>
  </g>

  <!-- Badges Row -->
  <g transform="translate(60, 125)">
    <rect x="0" y="0" width="${serviceWidth}" height="32" rx="16" fill="rgba(66, 133, 244, 0.15)" stroke="#8ab4f8" stroke-width="1.5" />
    <text x="16" y="21" font-family="${SANS_FONT}" font-size="14" font-weight="700" fill="#8ab4f8">${service}</text>

    <g transform="translate(${serviceWidth + 12}, 0)">
      <rect x="0" y="0" width="${statusWidth}" height="32" rx="16" fill="${statusBg}" stroke="${statusColor}" stroke-width="1.5" />
      <circle cx="15" cy="16" r="4" fill="${statusColor}" />
      <text x="26" y="21" font-family="${SANS_FONT}" font-size="13" font-weight="700" fill="${statusColor}">${escapeXml(statusText)}</text>
    </g>

    ${
      isBreaking
        ? `<g transform="translate(${serviceWidth + statusWidth + 24}, 0)">
            <rect x="0" y="0" width="174" height="32" rx="16" fill="rgba(234, 67, 53, 0.2)" stroke="#f28b82" stroke-width="1.5" />
            <path d="M18 9 L25 22 L11 22 Z" fill="none" stroke="#f28b82" stroke-width="1.8" stroke-linejoin="round" />
            <line x1="18" y1="13.5" x2="18" y2="17" stroke="#f28b82" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="18" cy="19.6" r="1" fill="#f28b82" />
            <text x="33" y="21" font-family="${SANS_FONT}" font-size="13" font-weight="700" fill="#f28b82">BREAKING CHANGE</text>
          </g>`
        : ''
    }

    <text x="1080" y="21" text-anchor="end" font-family="${MONO_FONT}" font-size="14" fill="#9aa0a6">${date}</text>
  </g>

  <!-- Title (Multi-line wrap) -->
  <g transform="translate(60, 215)">
    <text x="0" y="0" font-family="${SANS_FONT}" font-size="36" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
      ${titleSvg}
    </text>
  </g>

  <!-- Summary Paragraph -->
  <g transform="translate(60, ${summaryY})">
    <text x="0" y="0" font-family="${SANS_FONT}" font-size="20" font-weight="400" fill="#bdc1c6">
      ${summarySvg}
    </text>
  </g>

  <!-- Method Chips Row -->
  ${methodChips}

  <!-- Footer Branding -->
  <g transform="translate(60, 575)">
    <line x1="0" y1="-20" x2="1080" y2="-20" stroke="#2d2f31" stroke-width="1" />
    <text x="0" y="0" font-family="${SANS_FONT}" font-size="14" fill="#80868b">
      Sourced from Google API Discovery Service • <tspan fill="#8ab4f8" font-weight="600">Google Cloud Radar</tspan>
    </text>
    <text x="1080" y="0" text-anchor="end" font-family="${MONO_FONT}" font-size="14" font-weight="600" fill="#8ab4f8">
      https://google-cloud-radar.com
    </text>
  </g>
</svg>
  `.trim();

  const pngBuffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
