import type { APIRoute } from 'astro';
import {
  deduplicateFeedSiblingVersions,
  filterFeedEntries,
  getAllFeedEntries,
  parseLimitParam,
} from '../../lib/feed';

export const GET: APIRoute = async (context) => {
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
    home_page_url: 'https://google-cloud-radar.com',
    feed_url: 'https://google-cloud-radar.com/api/feed.json',
    description: 'Automated pre-release intelligence and real-time diffs for Google APIs and Cloud services.',
    user_comment: 'Sourced from Google Discovery Service.',
    items: entries.map((entry) => ({
      id: entry.slug,
      url: `https://google-cloud-radar.com/changes/${entry.slug}`,
      title: entry.title,
      content_text: entry.summary,
      date_published: `${entry.date}T00:00:00Z`,
      tags: entry.tags,
      _gcp_metadata: {
        service: entry.service,
        api: entry.api,
        impact: entry.impact,
        breaking: entry.breaking,
        breaking_reasons: entry.breaking_reasons || [],
        target_paths: entry.target_paths || entry.targetPaths || [],
        diff: entry.diff || { added: [], removed: [], changed: [] },
        interesting_score: entry.interesting_score,
        category: entry.category,
        methods: entry.extractedMethods,
      },
    })),
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
