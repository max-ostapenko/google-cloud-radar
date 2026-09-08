import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { createHash } from 'node:crypto';
import { getAllFeedEntries } from '../lib/feed';

export async function GET(context: APIContext) {
  const entries = await getAllFeedEntries();

  const rssResponse = await rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
    site: context.site || 'https://google-cloud-radar.com',
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

  const body = await rssResponse.text();
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;

  return new Response(body, {
    status: rssResponse.status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
      'ETag': etag,
    },
  });
}
