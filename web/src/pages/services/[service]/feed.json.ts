import type { APIRoute } from 'astro';
import { getAllFeedEntries, getServicesList, slugify } from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = await getAllFeedEntries();

  return services.map((svc) => {
    const serviceEntries = allEntries.filter(
      (e) => slugify(e.service) === svc.slug || slugify(e.api) === svc.slug
    );
    return {
      params: { service: svc.slug },
      props: {
        serviceInfo: svc,
        entries: serviceEntries,
      },
    };
  });
}

export const GET: APIRoute = async ({ props }) => {
  const { serviceInfo, entries } = props as { serviceInfo: any; entries: any[] };

  const responsePayload = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${serviceInfo.service} API Feed — Google Cloud Radar`,
    home_page_url: `https://google-cloud-radar.com/services/${serviceInfo.slug}`,
    feed_url: `https://google-cloud-radar.com/services/${serviceInfo.slug}/feed.json`,
    description: `Automated pre-release intelligence and real-time diffs for Google ${serviceInfo.service}.`,
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
        status: entry.status,
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
