import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import MiniSearch from '../web/node_modules/minisearch/dist/es/index.js';
import {
  deduplicateFeedSiblingVersions,
  fetchFromFirestore,
  getLocalFeedEntries,
} from '../web/src/lib/feed';

describe('Web Search & Card DOM Attributes', () => {
  it('getLocalFeedEntries and sibling grouping preserve breaking_reasons and extractedMethods', () => {
    const entries = getLocalFeedEntries();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const entriesWithReasons = entries.filter(
      (e) => Array.isArray(e.breaking_reasons) && e.breaking_reasons.length > 0
    );
    expect(entriesWithReasons.length).toBeGreaterThan(0);

    const deduplicated = deduplicateFeedSiblingVersions(entries);
    const multiVersionWithReasons = deduplicated.find(
      (e) =>
        e.siblingVersions &&
        e.siblingVersions.length > 1 &&
        e.siblingVersions.some((s) => s.breaking_reasons && s.breaking_reasons.length > 0)
    );
    if (multiVersionWithReasons) {
      const allSiblingReasons = multiVersionWithReasons.siblingVersions!.flatMap(
        (s) => s.breaking_reasons || []
      );
      expect(allSiblingReasons.length).toBeGreaterThan(0);
    }
  });

  it('fetchFromFirestore parses breaking_reasons and extracted_methods arrays correctly', async () => {
    const mockFirestoreResponse = {
      documents: [
        {
          fields: {
            id: { stringValue: '2026-10-14-test-v1' },
            api: { stringValue: 'test.v1' },
            service: { stringValue: 'Test Service' },
            title: { stringValue: 'Test Title' },
            summary: { stringValue: 'Test Summary' },
            is_breaking: { booleanValue: true },
            extracted_methods: {
              arrayValue: {
                values: [{ stringValue: 'jobs.query' }, { stringValue: 'jobs.insert' }],
              },
            },
            breaking_reasons: {
              arrayValue: {
                values: [{ stringValue: 'Removed field query' }],
              },
            },
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockFirestoreResponse), { status: 200 })
    );

    const entries = await fetchFromFirestore();
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(1);
    const entry = entries![0];
    expect(entry.extractedMethods).toEqual(['jobs.query', 'jobs.insert']);
    expect(entry.breaking_reasons).toEqual(['Removed field query']);

    fetchSpy.mockRestore();
  });

  it('ChangeCard.astro and index.astro wire data-methods, data-breaking-reasons, and corrected DOM selectors', () => {
    const cardSource = fs.readFileSync(
      path.resolve(process.cwd(), 'web/src/components/ChangeCard.astro'),
      'utf-8'
    );
    expect(cardSource).toContain('data-methods=');
    expect(cardSource).toContain('data-breaking-reasons=');

    const indexSource = fs.readFileSync(
      path.resolve(process.cwd(), 'web/src/pages/index.astro'),
      'utf-8'
    );
    expect(indexSource).toContain("querySelector('.card-title')");
    expect(indexSource).toContain("querySelector('.card-summary')");
    expect(indexSource).not.toContain("querySelector('.change-title')");
    expect(indexSource).not.toContain("querySelector('.change-summary')");
    expect(indexSource).toContain("getAttribute('data-methods')");
    expect(indexSource).toContain("getAttribute('data-breaking-reasons')");
    expect(indexSource).toContain("'methods'");
    expect(indexSource).toContain("'breaking_reasons'");
  });

  it('MiniSearch indexes methods and breaking_reasons multi-fields correctly', () => {
    const documents = [
      {
        id: '2026-10-14-storage',
        slug: '2026-10-14-storage',
        title: 'Breaking: Channel Management Updated',
        service: 'Cloud Storage',
        summary: 'Push notification lifecycle updated.',
        category: 'storage',
        text: "storage.v1 breaking: channel management updated push notification lifecycle updated. cloud storage breaking-change channels.stop removed method 'channels.stop' removed schema 'channel'",
        breaking: true,
        impact: 'high',
        methods: 'channels.stop',
        breaking_reasons: "Removed method 'channels.stop' Removed schema 'Channel'",
      },
      {
        id: '2026-10-15-bigquery',
        slug: '2026-10-15-bigquery',
        title: 'BigQuery Job Execution Update',
        service: 'BigQuery',
        summary: 'Updated job submission options.',
        category: 'data analytics',
        text: "bigquery.v2 bigquery job execution update updated job submission options. bigquery analytics jobs.query jobs.insert parameter 'timeoutms' changed type",
        breaking: true,
        impact: 'high',
        methods: 'jobs.query jobs.insert',
        breaking_reasons: "Parameter 'timeoutMs' changed type from 'integer' to 'string'",
      },
    ];

    const miniSearch = new MiniSearch({
      fields: ['text', 'title', 'service', 'summary', 'category', 'slug', 'methods', 'breaking_reasons'],
      storeFields: ['id'],
      searchOptions: {
        boost: {
          service: 3.0,
          title: 2.5,
          methods: 2.5,
          breaking_reasons: 2.0,
          text: 1.8,
          summary: 1.0,
        },
        fuzzy: 0.25,
        prefix: true,
        combineWith: 'AND',
      },
    });

    miniSearch.addAll(documents);

    // Searching for RPC methods not mentioned in title or summary
    const storageMethodResults = miniSearch.search('channels.stop');
    expect(storageMethodResults.map((r) => r.id)).toEqual(['2026-10-14-storage']);

    const bqMethodResults = miniSearch.search('jobs.query');
    expect(bqMethodResults.map((r) => r.id)).toEqual(['2026-10-15-bigquery']);

    // Searching for breaking reason keywords not mentioned in title or summary
    const schemaReasonResults = miniSearch.search('Removed schema Channel');
    expect(schemaReasonResults.map((r) => r.id)).toEqual(['2026-10-14-storage']);

    const paramReasonResults = miniSearch.search('timeoutMs');
    expect(paramReasonResults.map((r) => r.id)).toEqual(['2026-10-15-bigquery']);
  });
});
