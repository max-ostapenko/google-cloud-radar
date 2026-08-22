import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

export async function GET(context: APIContext) {
  const entries = await getAllFeedEntries();

  return rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
    site: context.site || 'https://gcp-discovery-radar.web.app',
    items: entries.map((entry) => ({
      title: `${entry.breaking ? '⚠️ [BREAKING] ' : ''}${entry.title}`,
      pubDate: new Date(entry.date),
      description: entry.summary,
      link: `/changes/${entry.slug}`,
      customData: `
        <category>${entry.category}</category>
        <service>${entry.service}</service>
        <api>${entry.api}</api>
        <impact>${entry.impact}</impact>
        <breaking>${entry.breaking}</breaking>
        <interesting_score>${entry.interesting_score}</interesting_score>
      `,
    })),
    customData: `<language>en-us</language>`,
  });
}
