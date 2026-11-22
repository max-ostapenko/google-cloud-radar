import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import {
  DEFAULT_SITE_URL,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  getServicesList,
  serializeRssFeedItem,
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

export async function GET(context: APIContext) {
  const { serviceInfo, entries } = context.props as { serviceInfo: ServiceInfo; entries: FeedEntry[] };
  const siteUrl = (context.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');

  return rss({
    title: `${serviceInfo.service} API Changes — Google Cloud Radar`,
    description: `Real-time pre-release intelligence and changelog for Google ${serviceInfo.service}. Tracked from Google Discovery Service.`,
    site: siteUrl,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
    items: entries.map((entry) => serializeRssFeedItem(entry, siteUrl)),
    customData: `<language>en-us</language><atom:link href="${siteUrl}/services/${serviceInfo.slug}/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
