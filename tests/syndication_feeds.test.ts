import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import {
  deduplicateFeedSiblingVersions,
  enrichWithSiblingVersions,
  escapeXml,
  getAllFeedEntries,
  normalizeReleaseDate,
  serializeAtomEntryXml,
  serializeJsonFeedItem,
  serializeLlmsEntryLines,
  serializeRssCustomData,
  serializeRssFeedItem,
  type FeedEntry,
  type ServiceInfo,
} from '../web/src/lib/feed.ts';
import { GET as getGlobalJsonFeed } from '../web/src/pages/api/feed.json.ts';
import { GET as getGlobalRssFeed } from '../web/src/pages/rss.xml.ts';
import { GET as getGlobalAtomFeed } from '../web/src/pages/atom.xml.ts';
import { GET as getGlobalLlmsTxt } from '../web/src/pages/llms.txt.ts';
import {
  GET as getServiceJsonFeed,
  getStaticPaths as getServiceJsonStaticPaths,
} from '../web/src/pages/services/[service]/feed.json.ts';
import {
  GET as getServiceRssFeed,
  getStaticPaths as getServiceRssStaticPaths,
} from '../web/src/pages/services/[service]/rss.xml.ts';
import {
  GET as getServiceAtomFeed,
} from '../web/src/pages/services/[service]/atom.xml.ts';
import {
  GET as getServiceLlmsTxt,
} from '../web/src/pages/services/[service]/llms.txt.ts';

function makeEntry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    slug: '2026-11-10-bigquery',
    docId: '2026-11-10-bigquery-v2',
    date: '2026-11-10',
    api: 'bigquery.v2',
    version: 'v2',
    service: 'BigQuery',
    service_id: 'bigquery',
    title: 'BigQuery Jobs API Update',
    impact: 'high',
    breaking: true,
    tags: ['bigquery', 'breaking-change'],
    interesting_score: 9,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Detailed markdown summary.',
    htmlContent: '<p>Detailed markdown summary.</p>',
    summary: 'Short summary of the BigQuery Jobs API update.',
    detailsHtml: '<p>Detailed markdown summary.</p>',
    extractedMethods: ['bigquery.jobs.insert', 'bigquery.jobs.get'],
    ecosystem: 'Google Cloud',
    category: 'Data Analytics',
    ...overrides,
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

describe('Syndication Feed Serializers & Release Lifecycle Metadata', () => {
  it('normalizes release dates from ISO strings, YYYY-MM-DD, and blank inputs', () => {
    expect(normalizeReleaseDate('2026-11-16')).toBe('2026-11-16');
    expect(normalizeReleaseDate('2026-07-06T00:00:00.000Z')).toBe('2026-07-06');
    expect(normalizeReleaseDate('  2026-08-20  ')).toBe('2026-08-20');
    expect(normalizeReleaseDate('')).toBeUndefined();
    expect(normalizeReleaseDate('   ')).toBeUndefined();
    expect(normalizeReleaseDate(null)).toBeUndefined();
    expect(normalizeReleaseDate(undefined)).toBeUndefined();
  });

  it('serializes JSON Feed 1.1 items with full release lifecycle metadata for released and canary entries', () => {
    const canary = makeEntry({ status: 'canary' });
    const canaryJson = serializeJsonFeedItem(canary);

    expect(canaryJson).toEqual({
      id: '2026-11-10-bigquery',
      url: 'https://google-cloud-radar.com/changes/2026-11-10-bigquery',
      title: 'BigQuery Jobs API Update',
      content_text: 'Short summary of the BigQuery Jobs API update.',
      date_published: '2026-11-10T00:00:00Z',
      tags: ['bigquery', 'breaking-change'],
      _gcp_metadata: {
        service: 'BigQuery',
        api: 'bigquery.v2',
        impact: 'high',
        breaking: true,
        interesting_score: 9,
        category: 'Data Analytics',
        status: 'canary',
        lead_time_days: null,
        official_release_date: null,
        official_release_notes_url: null,
        methods: ['bigquery.jobs.insert', 'bigquery.jobs.get'],
      },
    });
    expect('external_url' in canaryJson).toBe(false);

    const released = makeEntry({
      status: 'released',
      lead_time_days: 14,
      official_release_date: '2026-11-24T00:00:00.000Z',
      official_release_notes_url: 'https://docs.cloud.google.com/bigquery/docs/release-notes#November_24_2026',
    });
    const releasedJson = serializeJsonFeedItem(released);

    expect(releasedJson.external_url).toBe(
      'https://docs.cloud.google.com/bigquery/docs/release-notes#November_24_2026'
    );
    expect(releasedJson._gcp_metadata).toMatchObject({
      status: 'released',
      lead_time_days: 14,
      official_release_date: '2026-11-24',
      official_release_notes_url: 'https://docs.cloud.google.com/bigquery/docs/release-notes#November_24_2026',
    });
  });

  it('preserves zero-day lead_time_days === 0 across JSON, RSS, Atom, and llms.txt serializers', () => {
    const sameDayRelease = makeEntry({
      status: 'released',
      lead_time_days: 0,
      official_release_date: '2026-11-10',
      official_release_notes_url: 'https://cloud.google.com/release-notes?v=1&lang=en#Nov_10',
    });

    const jsonItem = serializeJsonFeedItem(sameDayRelease);
    expect(jsonItem._gcp_metadata.lead_time_days).toBe(0);
    expect(jsonItem._gcp_metadata.status).toBe('released');

    const rssItem = serializeRssFeedItem(sameDayRelease);
    expect(rssItem.customData).toContain('<status>released</status>');
    expect(rssItem.customData).toContain('<lead_time_days>0</lead_time_days>');
    expect(rssItem.customData).toContain('<official_release_date>2026-11-10</official_release_date>');
    expect(rssItem.customData).toContain(
      '<official_release_notes_url>https://cloud.google.com/release-notes?v=1&amp;lang=en#Nov_10</official_release_notes_url>'
    );

    const parsedRssCustom = xmlParser.parse(`<item>${rssItem.customData}</item>`).item;
    expect(parsedRssCustom.status).toBe('released');
    expect(parsedRssCustom.lead_time_days).toBe(0);
    expect(parsedRssCustom.official_release_date).toBe('2026-11-10');
    expect(parsedRssCustom.official_release_notes_url).toBe(
      'https://cloud.google.com/release-notes?v=1&lang=en#Nov_10'
    );

    const atomXml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:radar="https://google-cloud-radar.com/ns/1.0">${serializeAtomEntryXml(sameDayRelease)}</feed>`;
    const parsedAtom = xmlParser.parse(atomXml);
    expect(parsedAtom.feed.entry['radar:status']).toBe('released');
    expect(parsedAtom.feed.entry['radar:lead_time_days']).toBe(0);
    expect(parsedAtom.feed.entry['radar:official_release_date']).toBe('2026-11-10');
    expect(parsedAtom.feed.entry['radar:official_release_notes_url']).toBe(
      'https://cloud.google.com/release-notes?v=1&lang=en#Nov_10'
    );

    const llmsLines = serializeLlmsEntryLines(sameDayRelease).join('\n');
    expect(llmsLines).toContain('- **Status:** released (Lead time: 0d, Official release: 2026-11-10)');
    expect(llmsLines).toContain(
      '- [Official Release Notes](https://cloud.google.com/release-notes?v=1&lang=en#Nov_10)'
    );
  });

  it('omits optional release tags on canary RSS/Atom items and ignores blank release URLs', () => {
    const canaryWithBlankUrl = makeEntry({
      status: 'retracted',
      official_release_notes_url: '   ',
    });

    const jsonItem = serializeJsonFeedItem(canaryWithBlankUrl);
    expect('external_url' in jsonItem).toBe(false);
    expect(jsonItem._gcp_metadata.status).toBe('retracted');
    expect(jsonItem._gcp_metadata.official_release_notes_url).toBeNull();

    const rssCustom = serializeRssCustomData(canaryWithBlankUrl);
    expect(rssCustom).toContain('<status>retracted</status>');
    expect(rssCustom).not.toContain('<lead_time_days>');
    expect(rssCustom).not.toContain('<official_release_date>');
    expect(rssCustom).not.toContain('<official_release_notes_url>');

    expect(escapeXml(`A & B <C> "D" 'E'`)).toBe('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
  });

  it('preserves release lifecycle metadata across sibling API version deduplication', () => {
    const primaryV1 = makeEntry({
      slug: '2026-11-13-aiplatform',
      docId: '2026-11-13-aiplatform-v1',
      api: 'aiplatform.v1',
      version: 'v1',
      service: 'Vertex AI',
      impact: 'medium',
      breaking: false,
      status: 'canary',
      lead_time_days: undefined,
      official_release_date: undefined,
      official_release_notes_url: undefined,
    });

    const siblingV1beta1 = makeEntry({
      slug: '2026-11-13-aiplatform',
      docId: '2026-11-13-aiplatform-v1beta1',
      api: 'aiplatform.v1beta1',
      version: 'v1beta1',
      service: 'Vertex AI',
      impact: 'high',
      breaking: true,
      status: 'released',
      lead_time_days: 3,
      official_release_date: '2026-11-16',
      official_release_notes_url:
        'https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#November_16_2026',
    });

    const enriched = enrichWithSiblingVersions([primaryV1, siblingV1beta1]);
    const deduplicated = deduplicateFeedSiblingVersions(enriched);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].api).toBe('aiplatform.v1');
    expect(deduplicated[0].breaking).toBe(true);
    expect(deduplicated[0].impact).toBe('high');
    expect(deduplicated[0].status).toBe('released');
    expect(deduplicated[0].lead_time_days).toBe(3);
    expect(deduplicated[0].official_release_date).toBe('2026-11-16');
    expect(deduplicated[0].official_release_notes_url).toBe(
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#November_16_2026'
    );
  });

  it('returns valid JSON Feed 1.1 and RSS 2.0 payloads with complete lifecycle metadata across global and per-service endpoints under 200ms', async () => {
    const startJson = performance.now();
    const globalJsonRes = await getGlobalJsonFeed({
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    const jsonElapsedMs = performance.now() - startJson;

    expect(globalJsonRes.status).toBe(200);
    expect(globalJsonRes.headers.get('Content-Type')).toContain('application/feed+json');
    expect(jsonElapsedMs).toBeLessThan(200);

    const globalJson = JSON.parse(await globalJsonRes.text());
    expect(globalJson.version).toBe('https://jsonfeed.org/version/1.1');
    expect(Array.isArray(globalJson.items)).toBe(true);
    expect(globalJson.items.length).toBeGreaterThan(0);

    for (const item of globalJson.items) {
      expect(item._gcp_metadata).toBeDefined();
      expect(['canary', 'released', 'retracted', 'deprecated']).toContain(item._gcp_metadata.status);
      expect('lead_time_days' in item._gcp_metadata).toBe(true);
      expect('official_release_date' in item._gcp_metadata).toBe(true);
      expect('official_release_notes_url' in item._gcp_metadata).toBe(true);
      if (item._gcp_metadata.official_release_notes_url) {
        expect(item.external_url).toBe(item._gcp_metadata.official_release_notes_url);
      } else {
        expect('external_url' in item).toBe(false);
      }
    }

    const releasedJsonItems = globalJson.items.filter(
      (i: any) => i._gcp_metadata.status === 'released'
    );
    expect(releasedJsonItems.length).toBeGreaterThan(0);
    expect(
      releasedJsonItems.some(
        (i: any) =>
          typeof i._gcp_metadata.lead_time_days === 'number' &&
          typeof i._gcp_metadata.official_release_date === 'string' &&
          typeof i._gcp_metadata.official_release_notes_url === 'string'
      )
    ).toBe(true);

    // Global RSS 2.0 endpoint
    const startRss = performance.now();
    const globalRssRes = await getGlobalRssFeed({
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    const rssElapsedMs = performance.now() - startRss;

    expect(globalRssRes.status).toBe(200);
    expect(rssElapsedMs).toBeLessThan(200);

    const globalRssXml = await globalRssRes.text();
    const parsedGlobalRss = xmlParser.parse(globalRssXml);
    const rssItems = parsedGlobalRss?.rss?.channel?.item;
    expect(Array.isArray(rssItems)).toBe(true);
    expect(rssItems.length).toBe(globalJson.items.length);

    const releasedRssItems = rssItems.filter((item: any) => item.status === 'released');
    expect(releasedRssItems.length).toBe(releasedJsonItems.length);
    expect(
      releasedRssItems.some(
        (item: any) =>
          typeof item.lead_time_days === 'number' &&
          typeof item.official_release_date === 'string' &&
          typeof item.official_release_notes_url === 'string'
      )
    ).toBe(true);

    // Per-service JSON & RSS endpoints parity check (using Vertex AI which has both single-version and sibling-version releases)
    const jsonPaths = await getServiceJsonStaticPaths();
    const vertexJsonRoute = jsonPaths.find((p) => p.params.service === 'vertex-ai') || jsonPaths[0];
    expect(vertexJsonRoute).toBeDefined();

    const svcJsonStart = performance.now();
    const svcJsonRes = await getServiceJsonFeed({
      props: vertexJsonRoute.props,
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    expect(performance.now() - svcJsonStart).toBeLessThan(200);
    const svcJson = JSON.parse(await svcJsonRes.text());
    expect(svcJson.items.length).toBeGreaterThan(0);
    expect(
      svcJson.items.some(
        (i: any) =>
          i._gcp_metadata.status === 'released' &&
          typeof i._gcp_metadata.lead_time_days === 'number' &&
          typeof i._gcp_metadata.official_release_date === 'string' &&
          typeof i._gcp_metadata.official_release_notes_url === 'string'
      )
    ).toBe(true);

    const rssPaths = await getServiceRssStaticPaths();
    const vertexRssRoute = rssPaths.find((p) => p.params.service === 'vertex-ai') || rssPaths[0];
    const svcRssStart = performance.now();
    const svcRssRes = await getServiceRssFeed({
      props: vertexRssRoute.props,
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    expect(performance.now() - svcRssStart).toBeLessThan(200);
    const parsedSvcRss = xmlParser.parse(await svcRssRes.text());
    const svcRssItems = Array.isArray(parsedSvcRss.rss.channel.item)
      ? parsedSvcRss.rss.channel.item
      : [parsedSvcRss.rss.channel.item];
    expect(
      svcRssItems.some(
        (i: any) =>
          i.status === 'released' &&
          typeof i.lead_time_days === 'number' &&
          typeof i.official_release_date === 'string' &&
          typeof i.official_release_notes_url === 'string'
      )
    ).toBe(true);

    // Global & per-service Atom 1.0 + llms.txt endpoints
    const allEntries = deduplicateFeedSiblingVersions(await getAllFeedEntries());
    const sampleServiceInfo: ServiceInfo = vertexJsonRoute.props.serviceInfo;
    const sampleServiceEntries = vertexJsonRoute.props.entries;

    const globalAtomRes = await getGlobalAtomFeed({ site: new URL('https://google-cloud-radar.com') } as any);
    const parsedGlobalAtom = xmlParser.parse(await globalAtomRes.text());
    expect(Array.isArray(parsedGlobalAtom.feed.entry)).toBe(true);
    expect(parsedGlobalAtom.feed.entry.length).toBe(allEntries.length);

    const svcAtomRes = await getServiceAtomFeed({
      props: { serviceInfo: sampleServiceInfo, entries: sampleServiceEntries },
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    const parsedSvcAtom = xmlParser.parse(await svcAtomRes.text());
    expect(parsedSvcAtom.feed.entry).toBeDefined();

    const globalLlmsRes = await getGlobalLlmsTxt({ site: new URL('https://google-cloud-radar.com') } as any);
    const globalLlmsText = await globalLlmsRes.text();
    expect(globalLlmsText).toContain('- **Status:**');
    expect(globalLlmsText).toContain('Official Release Notes');

    const svcLlmsRes = await getServiceLlmsTxt({
      props: { serviceInfo: sampleServiceInfo, entries: sampleServiceEntries },
      site: new URL('https://google-cloud-radar.com'),
    } as any);
    const svcLlmsText = await svcLlmsRes.text();
    expect(svcLlmsText).toContain('- **Status:**');
    expect(svcLlmsText).toContain('Official Release Notes');
  });
});
