import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  buildGcpMetadata,
  buildRssCustomData,
  FeedEntry,
} from '../web/src/lib/feed';

describe('Centralized Feed Metadata Helpers', () => {
  const completeEntry: FeedEntry = {
    slug: '2026-10-14-bigquery',
    date: '2026-10-14',
    api: 'bigquery.v2',
    service: 'BigQuery',
    service_id: 'bigquery',
    version: 'v2',
    title: 'BigQuery API Update',
    impact: 'high',
    breaking: false,
    tags: ['bigquery', 'analytics'],
    interesting_score: 8,
    status: 'released',
    lead_time_days: 14,
    official_release_date: '2026-10-28',
    official_release_notes_url: 'https://cloud.google.com/bigquery/docs/release-notes#October_14_2026',
    reaction_counts: { like_change: 2, released: 5, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'BigQuery added a new field.',
    htmlContent: '<p>BigQuery added a new field.</p>',
    summary: 'BigQuery added a new field.',
    detailsHtml: '<p>BigQuery added a new field.</p>',
    extractedMethods: ['jobs.get', 'jobs.insert'],
    ecosystem: 'Data & Analytics',
    category: 'Analytics',
  };

  const minimalEntry: FeedEntry = {
    slug: '2026-10-14-storage',
    date: '2026-10-14',
    api: 'storage.v1',
    service: 'Cloud Storage',
    service_id: 'cloud-storage',
    version: 'v1',
    title: 'Cloud Storage API Update',
    impact: 'medium',
    breaking: true,
    tags: ['storage'],
    interesting_score: 5,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Storage breaking change.',
    htmlContent: '<p>Storage breaking change.</p>',
    summary: 'Storage breaking change.',
    detailsHtml: '<p>Storage breaking change.</p>',
    extractedMethods: [],
    ecosystem: 'Infrastructure',
    category: 'Storage',
  };

  describe('escapeXml', () => {
    it('escapes XML special characters', () => {
      expect(escapeXml('AT&T < "test" & \'value\'>')).toBe('AT&amp;T &lt; &quot;test&quot; &amp; &apos;value&apos;&gt;');
    });

    it('returns empty string for null or undefined', () => {
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
    });
  });

  describe('buildGcpMetadata', () => {
    it('serializes complete release lifecycle metadata when present', () => {
      const meta = buildGcpMetadata(completeEntry);

      expect(meta).toEqual({
        service: 'BigQuery',
        api: 'bigquery.v2',
        impact: 'high',
        breaking: false,
        interesting_score: 8,
        category: 'Analytics',
        status: 'released',
        methods: ['jobs.get', 'jobs.insert'],
        lead_time_days: 14,
        official_release_date: '2026-10-28',
        official_release_notes_url: 'https://cloud.google.com/bigquery/docs/release-notes#October_14_2026',
      });
    });

    it('preserves lead_time_days when it is 0', () => {
      const meta = buildGcpMetadata({ ...completeEntry, lead_time_days: 0 });
      expect(meta.lead_time_days).toBe(0);
    });

    it('omits optional lifecycle fields when undefined or empty', () => {
      const meta = buildGcpMetadata(minimalEntry);

      expect(meta).toEqual({
        service: 'Cloud Storage',
        api: 'storage.v1',
        impact: 'medium',
        breaking: true,
        interesting_score: 5,
        category: 'Storage',
        status: 'canary',
        methods: [],
      });

      expect('lead_time_days' in meta).toBe(false);
      expect('official_release_date' in meta).toBe(false);
      expect('official_release_notes_url' in meta).toBe(false);
    });
  });

  describe('buildRssCustomData', () => {
    it('outputs custom XML elements for complete release lifecycle metadata', () => {
      const xml = buildRssCustomData(completeEntry);

      expect(xml).toContain('<category>Analytics</category>');
      expect(xml).toContain('<service>BigQuery</service>');
      expect(xml).toContain('<api>bigquery.v2</api>');
      expect(xml).toContain('<impact>high</impact>');
      expect(xml).toContain('<breaking>false</breaking>');
      expect(xml).toContain('<interesting_score>8</interesting_score>');
      expect(xml).toContain('<status>released</status>');
      expect(xml).toContain('<lead_time_days>14</lead_time_days>');
      expect(xml).toContain('<official_release_date>2026-10-28</official_release_date>');
      expect(xml).toContain('<official_release_notes_url>https://cloud.google.com/bigquery/docs/release-notes#October_14_2026</official_release_notes_url>');
    });

    it('preserves lead_time_days XML tag when it is 0', () => {
      const xml = buildRssCustomData({ ...completeEntry, lead_time_days: 0 });
      expect(xml).toContain('<lead_time_days>0</lead_time_days>');
    });

    it('omits optional lifecycle XML tags when missing', () => {
      const xml = buildRssCustomData(minimalEntry);

      expect(xml).toContain('<category>Storage</category>');
      expect(xml).toContain('<service>Cloud Storage</service>');
      expect(xml).toContain('<status>canary</status>');
      expect(xml).not.toContain('<lead_time_days>');
      expect(xml).not.toContain('<official_release_date>');
      expect(xml).not.toContain('<official_release_notes_url>');
    });

    it('escapes XML characters in fields', () => {
      const entryWithSpecialChars: FeedEntry = {
        ...minimalEntry,
        service: 'Cloud & AI <Service>',
        category: "R&D 'Core'",
        official_release_notes_url: 'https://example.com/notes?a=1&b=2',
      };
      const xml = buildRssCustomData(entryWithSpecialChars);

      expect(xml).toContain('<service>Cloud &amp; AI &lt;Service&gt;</service>');
      expect(xml).toContain('<category>R&amp;D &apos;Core&apos;</category>');
      expect(xml).toContain('<official_release_notes_url>https://example.com/notes?a=1&amp;b=2</official_release_notes_url>');
    });
  });
});
