import { describe, expect, it } from 'vitest';
import {
  deduplicateFeedSiblingVersions,
  enrichWithSiblingVersions,
  getLocalFeedEntries,
  getPublishedTimestamp,
  type FeedEntry,
  type FeedEntryMeta,
} from '../web/src/lib/feed';

describe('Feed ISO Timestamps and Published Timestamp Helper', () => {
  it('uses generated_at ISO timestamp when present', () => {
    const entry: FeedEntryMeta = {
      slug: 'test-entry-1',
      date: '2026-10-03',
      api: 'storage.v1',
      service: 'Cloud Storage',
      title: 'Test Update',
      impact: 'medium',
      breaking: false,
      tags: ['storage'],
      interesting_score: 7,
      generated_at: '2026-10-03T18:37:16.195Z',
    };

    const pubDate = getPublishedTimestamp(entry);
    expect(pubDate.toISOString()).toBe('2026-10-03T18:37:16.195Z');
  });

  it('falls back to 12:00:00 UTC when only YYYY-MM-DD date is provided', () => {
    const entry: FeedEntryMeta = {
      slug: 'test-entry-2',
      date: '2026-10-03',
      api: 'bigquery.v2',
      service: 'BigQuery',
      title: 'BigQuery Update',
      impact: 'low',
      breaking: false,
      tags: ['bigquery'],
      interesting_score: 5,
    };

    const pubDate = getPublishedTimestamp(entry);
    expect(pubDate.toISOString()).toBe('2026-10-03T12:00:00.000Z');
  });

  it('falls back to 12:00:00 UTC on date when generated_at is malformed', () => {
    const entry: FeedEntryMeta = {
      slug: 'test-entry-malformed',
      date: '2026-10-03',
      api: 'bigquery.v2',
      service: 'BigQuery',
      title: 'BigQuery Update',
      impact: 'low',
      breaking: false,
      tags: ['bigquery'],
      interesting_score: 5,
      generated_at: 'not-a-valid-date',
    };

    const pubDate = getPublishedTimestamp(entry);
    expect(pubDate.toISOString()).toBe('2026-10-03T12:00:00.000Z');
  });

  it('ensures distinct pubDate timestamps for entries published on the same day', () => {
    const entryA: FeedEntryMeta = {
      slug: 'entry-a',
      date: '2026-10-03',
      api: 'aiplatform.v1',
      service: 'Vertex AI',
      title: 'Entry A',
      impact: 'medium',
      breaking: false,
      tags: [],
      interesting_score: 5,
      generated_at: '2026-10-03T10:15:00.000Z',
    };

    const entryB: FeedEntryMeta = {
      slug: 'entry-b',
      date: '2026-10-03',
      api: 'compute.v1',
      service: 'Compute Engine',
      title: 'Entry B',
      impact: 'high',
      breaking: true,
      tags: [],
      interesting_score: 8,
      generated_at: '2026-10-03T14:45:30.000Z',
    };

    const dateA = getPublishedTimestamp(entryA);
    const dateB = getPublishedTimestamp(entryB);

    expect(dateA.toISOString()).not.toBe(dateB.toISOString());
    expect(dateB.getTime() - dateA.getTime()).toBeGreaterThan(0);
  });

  it('populates generated_at in getLocalFeedEntries', () => {
    const entries = getLocalFeedEntries();
    expect(entries.length).toBeGreaterThan(0);

    const entryWithGeneratedAt = entries.find((e) => Boolean(e.generated_at));
    expect(entryWithGeneratedAt).toBeDefined();
    expect(entryWithGeneratedAt?.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserves generated_at across deduplicateFeedSiblingVersions', () => {
    const baseEntry: FeedEntry = {
      slug: '2026-11-20-aiplatform',
      docId: '2026-11-20-aiplatform-v1',
      date: '2026-11-20',
      api: 'aiplatform.v1',
      version: 'v1',
      service: 'Vertex AI',
      title: 'Vertex AI Update',
      impact: 'medium',
      breaking: false,
      tags: ['AI'],
      interesting_score: 7,
      status: 'canary',
      reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
      comments_count: 0,
      rawContent: 'Details v1',
      htmlContent: '<p>Details v1</p>',
      summary: 'Summary v1',
      detailsHtml: '<p>Details v1</p>',
      extractedMethods: [],
      ecosystem: 'AI & ML',
      category: 'AI & Machine Learning',
    };

    const betaEntry: FeedEntry = {
      ...baseEntry,
      docId: '2026-11-20-aiplatform-v1beta1',
      api: 'aiplatform.v1beta1',
      version: 'v1beta1',
      impact: 'high',
      breaking: true,
      generated_at: '2026-11-20T22:11:41.921Z',
    };

    const enriched = enrichWithSiblingVersions([baseEntry, betaEntry]);
    const deduplicated = deduplicateFeedSiblingVersions(enriched);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].generated_at).toBe('2026-11-20T22:11:41.921Z');
    expect(getPublishedTimestamp(deduplicated[0]).toISOString()).toBe('2026-11-20T22:11:41.921Z');
  });
});
