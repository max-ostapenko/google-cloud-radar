import type { APIRoute } from 'astro';
import { getAllFeedEntries, getServicesList, slugify } from '../../../lib/feed';

function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = await getAllFeedEntries();

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
  const { serviceInfo, entries } = props as { serviceInfo: any; entries: any[] };
  const siteUrl = (site ? site.toString() : 'https://google-cloud-radar.com').replace(/\/+$/, '');
  const latestDate = entries[0]?.date ? `${entries[0].date}T00:00:00Z` : new Date().toISOString();

  const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
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
  ${entries.map((entry) => `
  <entry>
    <title>${entry.breaking ? '⚠️ [BREAKING] ' : ''}${escapeXml(entry.title)}</title>
    <link href="${siteUrl}/changes/${entry.slug}" rel="alternate" type="text/html" />
    <id>${siteUrl}/changes/${entry.slug}</id>
    <published>${entry.date}T00:00:00Z</published>
    <updated>${entry.date}T00:00:00Z</updated>
    <summary type="text">${escapeXml(entry.summary)}</summary>
    <category term="${escapeXml(entry.category)}" />
    <category term="${escapeXml(entry.service)}" />
    <category term="${escapeXml(entry.api)}" />
  </entry>`).join('')}
</feed>`;

  return new Response(feedXml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
