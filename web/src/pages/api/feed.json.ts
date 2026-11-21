import type { APIRoute } from 'astro';
import { deduplicateFeedSiblingVersions, formatJsonFeedItem, getAllFeedEntries } from '../../lib/feed';

export const GET: APIRoute = async () => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const siteUrl = 'https://google-cloud-radar.com';

  const responsePayload = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Google Cloud Radar JSON Feed',
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/api/feed.json`,
    description: 'Automated pre-release intelligence and real-time diffs for Google APIs and Cloud services.',
    user_comment: 'Sourced from Google Discovery Service.',
    items: entries.map((entry) => formatJsonFeedItem(entry, siteUrl)),
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
