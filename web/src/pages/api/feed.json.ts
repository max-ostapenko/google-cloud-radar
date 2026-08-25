import type { APIRoute } from 'astro';
import { getAllFeedEntries } from '../../lib/feed';

export const GET: APIRoute = async () => {
  const entries = await getAllFeedEntries();

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
        interesting_score: entry.interesting_score,
        category: entry.category,
        methods: entry.extractedMethods,
      },
    })),
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
