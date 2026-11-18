import { describe, it, expect } from 'vitest';
import { computeRadarStatsFromEntries } from '../web/src/lib/stats.ts';
import type { FeedEntry } from '../web/src/lib/feed.ts';

function makeEntry(overrides: Partial<FeedEntry>): FeedEntry {
  return {
    slug: '2026-11-10-bigquery',
    date: new Date().toISOString().slice(0, 10),
    api: 'bigquery.v2',
    service: 'BigQuery',
    title: 'BigQuery API Update',
    impact: 'medium',
    breaking: false,
    tags: ['bigquery'],
    interesting_score: 6,
    status: 'released',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Details',
    htmlContent: '<p>Details</p>',
    summary: 'Summary',
    detailsHtml: '<p>Details</p>',
    extractedMethods: [],
    ecosystem: 'Google Cloud',
    category: 'Data Analytics',
    ...overrides,
  };
}

describe('stats zero-day lead time handling (f2b68691)', () => {
  it('includes lead_time_days === 0 in overall average, per-service average, and < 7 Days bucket', () => {
    const entries: FeedEntry[] = [
      makeEntry({
        slug: '2026-11-10-bigquery-v2',
        service: 'BigQuery',
        api: 'bigquery.v2',
        lead_time_days: 0,
      }),
      makeEntry({
        slug: '2026-11-11-bigquery-v2',
        service: 'BigQuery',
        api: 'bigquery.v2',
        lead_time_days: 10,
      }),
      makeEntry({
        slug: '2026-11-12-storage-v1',
        service: 'Cloud Storage',
        api: 'storage.v1',
        lead_time_days: 0,
      }),
      makeEntry({
        slug: '2026-11-13-run-v2',
        service: 'Cloud Run',
        api: 'run.v2',
        status: 'canary',
        lead_time_days: undefined,
      }),
    ];

    const report = computeRadarStatsFromEntries(entries, 90);

    // Average of [0, 10, 0] = 3.3 days (not 10.0)
    expect(report.overallAvgLeadTime).toBe(3.3);

    const bq = report.serviceVelocities.find((s) => s.service === 'BigQuery');
    expect(bq?.avgLeadTime).toBe(5);

    const gcs = report.serviceVelocities.find((s) => s.service === 'Cloud Storage');
    expect(gcs?.avgLeadTime).toBe(0);

    const lt7Bucket = report.leadTimeBuckets.find((b) => b.label === '< 7 Days');
    expect(lt7Bucket?.count).toBe(2);
    expect(lt7Bucket?.percentage).toBe(67);
  });
});
