import type { APIRoute } from 'astro';
import {
  DEFAULT_SITE_URL,
  RADAR_XML_NAMESPACE,
  deduplicateFeedSiblingVersions,
  getAllFeedEntries,
  serializeAtomEntryXml,
} from '../lib/feed';

export const GET: APIRoute = async (context) => {
  const entries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
  const siteUrl = (context.site ? context.site.toString() : DEFAULT_SITE_URL).replace(/\/+$/, '');
  const latestDate = entries[0]?.date ? `${entries[0].date}T00:00:00Z` : new Date().toISOString();

  const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:radar="${RADAR_XML_NAMESPACE}">
  <title>Google Cloud Radar — Real-Time Google API &amp; Cloud Feed</title>
  <subtitle>Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.</subtitle>
  <link href="${siteUrl}/atom.xml" rel="self" type="application/atom+xml" />
  <link href="${siteUrl}" rel="alternate" type="text/html" />
  <id>${siteUrl}/atom.xml</id>
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
