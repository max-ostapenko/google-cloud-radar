import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  serializeRssFeedItem,
} from '../lib/feed';

export async function GET(context: APIContext) {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const siteUrl = (context.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

  return rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
    site: siteUrl,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
    items: entries.map((entry) => serializeRssFeedItem(entry, siteUrl)),
    customData: `<language>en-us</language><atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
