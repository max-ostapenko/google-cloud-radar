import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  serializeJsonFeedItem,
} from '../../lib/feed';

export const GET: APIRoute = async (context) => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries()).filter(
    (entry) => entry.breaking === true
  );
  const siteUrl = (context?.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

  const responsePayload = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Google Cloud Radar — Breaking Changes JSON Feed',
    home_page_url: `${siteUrl}/?impact=breaking`,
    feed_url: `${siteUrl}/api/breaking.json`,
    description: 'Backward-incompatible Google API and Cloud service changes with structured AST diffs.',
    user_comment: 'Sourced from Google Discovery Service.',
    items: entries.map((entry) =>
      serializeJsonFeedItem(entry, siteUrl, { includeMachineDiff: true })
    ),
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
