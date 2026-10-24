import type { APIRoute } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async (context) => {
  const entries = await getAllFeedEntries();
  const siteUrl = (context.site ? context.site.toString() : 'https://google-cloud-radar.com').replace(/\/+$/, '');
  const latestDate = entries[0]?.date ? `${entries[0].date}T00:00:00Z` : new Date().toISOString();

  const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
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
