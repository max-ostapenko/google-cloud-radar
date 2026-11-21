import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { buildRssCustomData, deduplicateFeedSiblingVersions, getAllFeedEntries, getPublishedTimestamp, getServicesList, slugify } from '../../../lib/feed';

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
  const { serviceInfo, entries } = context.props as { serviceInfo: any; entries: any[] };
  const siteUrl = (context.site ? context.site.toString() : 'https://google-cloud-radar.com').replace(/\/+$/, '');

  return rss({
    title: `${serviceInfo.service} API Changes — Google Cloud Radar`,
    description: `Real-time pre-release intelligence and changelog for Google ${serviceInfo.service}. Tracked from Google Discovery Service.`,
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
    customData: `<language>en-us</language><atom:link href="${siteUrl}/services/${serviceInfo.slug}/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
