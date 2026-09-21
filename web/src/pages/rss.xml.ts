import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const entries = await getAllFeedEntries();

  return rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
    site: context.site || 'https://google-cloud-radar.com',
    items: entries.map((entry) => ({
      title: `${entry.breaking ? '⚠️ [BREAKING] ' : ''}${entry.title}`,
      pubDate: new Date(entry.date),
      description: entry.summary,
      link: `/changes/${entry.slug}`,
      customData: `
        <category>${escapeXml(entry.category)}</category>
        <service>${escapeXml(entry.service)}</service>
        <api>${escapeXml(entry.api)}</api>
        <impact>${escapeXml(entry.impact)}</impact>
        <breaking>${escapeXml(entry.breaking)}</breaking>
        <interesting_score>${escapeXml(entry.interesting_score)}</interesting_score>
      `,
    })),
    customData: `<language>en-us</language>`,
  });
}
