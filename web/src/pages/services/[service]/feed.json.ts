import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  getServicesList,
  serializeJsonFeedItem,
  slugify,
  type FeedEntry,
  type ServiceInfo,
} from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());

  return services.map((svc) => {
    const serviceEntries = allEntries.filter(
      (e) => slugify(e.service) === svc.slug
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

export const GET: APIRoute = async ({ props, site }) => {
  const { serviceInfo, entries } = props as { serviceInfo: ServiceInfo; entries: FeedEntry[] };
  const siteUrl = (site ? site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

  const responsePayload = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${serviceInfo.service} API Feed — Google Cloud Radar`,
    home_page_url: `${siteUrl}/services/${serviceInfo.slug}`,
    feed_url: `${siteUrl}/services/${serviceInfo.slug}/feed.json`,
    description: `Automated pre-release intelligence and real-time diffs for Google ${serviceInfo.service}.`,
    user_comment: 'Sourced from Google Discovery Service.',
    items: entries.map((entry) => serializeJsonFeedItem(entry, siteUrl)),
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
