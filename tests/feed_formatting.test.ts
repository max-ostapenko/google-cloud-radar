import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  formatFeedContentHtml,
  formatRssCustomData,
  formatJsonFeedItem,
  type FeedEntry,
} from '../web/src/lib/feed';

describe('Feed Formatting Helpers', () => {
  const sampleEntry: FeedEntry = {
    slug: '2026-06-26-bigquery',
    docId: '2026-06-26-bigquery-v2',
    date: '2026-06-26',
    api: 'bigquery.v2',
    version: 'v2',
    service: 'BigQuery',
    service_id: 'bigquery',
    title: 'BigQuery Job Insert Breaking Update',
    impact: 'high',
    breaking: true,
    tags: ['breaking', 'jobs'],
    interesting_score: 9,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: '## Breaking Changes\nRemoved required parameter `reservation` from Jobs insert.',
    htmlContent: '<h2>Breaking Changes</h2>\n<p>Removed required parameter <code>reservation</code> from Jobs insert.</p>',
    summary: 'Removed required parameter reservation from Jobs insert.',
    detailsHtml: '<h2>Breaking Changes</h2>\n<p>Removed required parameter <code>reservation</code> from Jobs insert.</p>',
    extractedMethods: ['google.cloud.bigquery.v2.JobsService.Insert', 'google.cloud.bigquery.v2.JobsService.Get'],
    ecosystem: 'Data Analytics',
    category: 'Big Data',
  };

  describe('escapeXml', () => {
    it('escapes XML special characters properly', () => {
      expect(escapeXml('<foo & "bar" \'baz\'>')).toBe('&lt;foo &amp; &quot;bar&quot; &apos;baz&apos;&gt;');
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
    });
  });

  describe('formatFeedContentHtml', () => {
    it('appends formatted method list when extractedMethods is populated', () => {
      const html = formatFeedContentHtml(sampleEntry);
      expect(html).toContain('<h2>Breaking Changes</h2>');
      expect(html).toContain('<div class="methods"><h3>Impacted Methods</h3><ul>');
      expect(html).toContain('<li><code>google.cloud.bigquery.v2.JobsService.Insert</code></li>');
      expect(html).toContain('<li><code>google.cloud.bigquery.v2.JobsService.Get</code></li>');
    });

    it('returns base html without methods section when extractedMethods is empty', () => {
      const entryNoMethods: FeedEntry = { ...sampleEntry, extractedMethods: [] };
      const html = formatFeedContentHtml(entryNoMethods);
      expect(html).toBe(sampleEntry.htmlContent);
      expect(html).not.toContain('<div class="methods">');
    });

    it('falls back to parsing rawContent safely when htmlContent is empty', () => {
      const entryFallback: FeedEntry = {
        ...sampleEntry,
        htmlContent: '',
        extractedMethods: [],
        rawContent: 'Added **new** `dataset` field <script>alert(1)</script>',
      };
      const html = formatFeedContentHtml(entryFallback);
      expect(html).toContain('<strong>new</strong>');
      expect(html).toContain('<code>dataset</code>');
      expect(html).not.toContain('<script>');
    });
  });

  describe('formatRssCustomData', () => {
    it('emits metadata tags and nested method tags in XML format', () => {
      const customXml = formatRssCustomData(sampleEntry);
      expect(customXml).toContain('<category>Big Data</category>');
      expect(customXml).toContain('<service>BigQuery</service>');
      expect(customXml).toContain('<api>bigquery.v2</api>');
      expect(customXml).toContain('<impact>high</impact>');
      expect(customXml).toContain('<breaking>true</breaking>');
      expect(customXml).toContain('<interesting_score>9</interesting_score>');
      expect(customXml).toContain('<status>canary</status>');
      expect(customXml).toContain(
        '<methods><method>google.cloud.bigquery.v2.JobsService.Insert</method><method>google.cloud.bigquery.v2.JobsService.Get</method></methods>'
      );
    });

    it('emits empty methods tag when extractedMethods is empty', () => {
      const entryNoMethods: FeedEntry = { ...sampleEntry, extractedMethods: [] };
      const customXml = formatRssCustomData(entryNoMethods);
      expect(customXml).toContain('<methods></methods>');
    });
  });

  describe('formatJsonFeedItem', () => {
    it('returns valid JSON Feed 1.1 item structure', () => {
      const siteUrl = 'https://google-cloud-radar.com/';
      const item = formatJsonFeedItem(sampleEntry, siteUrl);

      expect(item.id).toBe('2026-06-26-bigquery');
      expect(item.url).toBe('https://google-cloud-radar.com/changes/2026-06-26-bigquery');
      expect(item.title).toBe('BigQuery Job Insert Breaking Update');
      expect(item.summary).toBe('Removed required parameter reservation from Jobs insert.');
      expect(item.content_text).toBe('Removed required parameter reservation from Jobs insert.');
      expect(item.content_html).toContain('<div class="methods"><h3>Impacted Methods</h3><ul>');
      expect(item.date_published).toBe('2026-06-26T12:00:00.000Z');
      expect(item.tags).toEqual(['breaking', 'jobs']);
      expect(item._gcp_metadata).toEqual({
        service: 'BigQuery',
        api: 'bigquery.v2',
        impact: 'high',
        breaking: true,
        interesting_score: 9,
        category: 'Big Data',
        status: 'canary',
        methods: ['google.cloud.bigquery.v2.JobsService.Insert', 'google.cloud.bigquery.v2.JobsService.Get'],
      });
    });

    it('uses generated_at ISO timestamp for date_published when available', () => {
      const entryWithTimestamp: FeedEntry = {
        ...sampleEntry,
        generated_at: '2026-06-26T18:37:16.195Z',
      };
      const item = formatJsonFeedItem(entryWithTimestamp, 'https://google-cloud-radar.com');
      expect(item.date_published).toBe('2026-06-26T18:37:16.195Z');
    });
  });
});
