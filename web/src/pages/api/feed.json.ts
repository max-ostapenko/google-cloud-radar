import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  getAllFeedEntries,
  parseLimitParam,
  serializeJsonFeedItem,
} from '../../lib/feed';

export const GET: APIRoute = async (context) => {
  const siteUrl = (context?.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');
  const reqUrl = context?.url ?? (context?.request?.url ? new URL(context.request.url) : null);
  const impact = reqUrl?.searchParams.get('impact');
  const breaking = reqUrl?.searchParams.get('breaking');
  const service = reqUrl?.searchParams.get('service');
  const api = reqUrl?.searchParams.get('api');
  const since = reqUrl?.searchParams.get('since');
  const limitParam = reqUrl?.searchParams.get('limit');

  const limit = parseLimitParam(limitParam);

  const rawEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const filteredEntries = filterFeedEntries(rawEntries, {
    impact,
    breaking,
    service,
    api,
    since,
  });

  const entries = limit ? filteredEntries.slice(0, limit) : filteredEntries;

  const responsePayload = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Google Cloud Radar JSON Feed',
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/api/feed.json`,
    description: 'Automated pre-release intelligence and real-time diffs for Google APIs and Cloud services.',
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
