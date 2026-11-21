import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { buildRssCustomData, deduplicateFeedSiblingVersions, getAllFeedEntries, getPublishedTimestamp } from '../lib/feed';

export async function GET(context: APIContext) {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const siteUrl = (context.site ? context.site.toString() : 'https://google-cloud-radar.com').replace(/\/+$/, '');

  return rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
    site: siteUrl,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
    items: entries.map((entry) => ({
      title: `${entry.breaking ? '⚠️ [BREAKING] ' : ''}${entry.title}`,
      pubDate: getPublishedTimestamp(entry),
      description: entry.summary,
      link: `${siteUrl}/changes/${entry.slug}`,
      customData: buildRssCustomData(entry),
    })),
    customData: `<language>en-us</language><atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
