import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  RADAR_XML_NAMESPACE,
  deduplicateFeedSiblingVersions,
  escapeXml,
  getAllFeedEntries,
  getServicesList,
  serializeAtomEntryXml,
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
  const latestDate = entries[0]?.date ? `${entries[0].date}T00:00:00Z` : new Date().toISOString();

  const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:radar="${RADAR_XML_NAMESPACE}">
  <title>${escapeXml(serviceInfo.service)} API Changes — Google Cloud Radar</title>
  <subtitle>Real-time pre-release intelligence and changelog for Google ${escapeXml(serviceInfo.service)}. Tracked from Google Discovery Service.</subtitle>
  <link href="${siteUrl}/services/${serviceInfo.slug}/atom.xml" rel="self" type="application/atom+xml" />
  <link href="${siteUrl}/services/${serviceInfo.slug}" rel="alternate" type="text/html" />
  <id>${siteUrl}/services/${serviceInfo.slug}/atom.xml</id>
  <updated>${latestDate}</updated>
  <author>
    <name>Google Cloud Radar</name>
    <uri>https://github.com/max-ostapenko/google-cloud-radar</uri>
  </author>
  ${entries.map((entry) => serializeAtomEntryXml(entry, siteUrl)).join('')}
</feed>`;

  return new Response(feedXml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
