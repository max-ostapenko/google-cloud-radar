import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as feedModule from '../web/src/lib/feed';
import {
  MAX_JSON_FEED_DIFF_ITEMS,
  MAX_JSON_FEED_TARGET_PATHS,
  deduplicateFeedSiblingVersions,
  enrichWithSiblingVersions,
  formatMachineFeedEntryDetails,
  serializeJsonFeedItem,
  type FeedEntry,
} from '../web/src/lib/feed';
import { GET as llmsTxtGET } from '../web/src/pages/llms.txt';
import { GET as serviceLlmsTxtGET } from '../web/src/pages/services/[service]/llms.txt';
import { GET as apiFeedJsonGET } from '../web/src/pages/api/feed.json';
import { GET as apiBreakingJsonGET } from '../web/src/pages/api/breaking.json';
import { GET as serviceFeedJsonGET } from '../web/src/pages/services/[service]/feed.json';
import { rebuildIndexFromChanges, writeInsight } from '../scripts/feed_writer';
import { parseJsonChangeFile } from '../scripts/seed_prod_firestore';

const mockEntries: FeedEntry[] = [
  {
    slug: '2026-09-15-aiplatform',
    docId: '2026-09-15-aiplatform-v1',
    date: '2026-09-15',
    api: 'aiplatform.v1',
    version: 'v1',
    service: 'Vertex AI',
    service_id: 'vertex-ai',
    title: 'Vertex AI Model Tuning Update',
    impact: 'high',
    breaking: true,
    breaking_reasons: [
      "Property 'oldParam' in method 'models.tune' was removed",
    ],
    target_paths: [
      'schemas.model.properties.oldparam',
      'schemas.model.properties.newparam',
    ],
    targetPaths: [
      'schemas.model.properties.oldparam',
      'schemas.model.properties.newparam',
    ],
    diff: {
      added: [{ path: 'schemas.model.properties.newparam', value: { type: 'string' } }],
      removed: [{ path: 'schemas.model.properties.oldparam', old_value: { type: 'string' } }],
      changed: [{ path: 'schemas.model.properties.timeout', old: 10, new: 30 }],
    },
    siblingVersions: [
      {
        slug: '2026-09-15-aiplatform',
        api: 'aiplatform.v1',
        version: 'v1',
        breaking: true,
        impact: 'high',
        title: 'Vertex AI Model Tuning Update',
        summary: 'Vertex AI Model Tuning breaking changes.',
        rawContent: 'Summary details',
        detailsHtml: '<p>Summary details</p>',
        extractedMethods: ['models.tune'],
        isPrimary: true,
      },
      {
        slug: '2026-09-15-aiplatform',
        api: 'aiplatform.v1beta1',
        version: 'v1beta1',
        breaking: true,
        impact: 'high',
        title: 'Vertex AI Model Tuning Update (Beta)',
        summary: 'Vertex AI Model Tuning breaking changes.',
        rawContent: 'Summary details',
        detailsHtml: '<p>Summary details</p>',
        extractedMethods: ['models.tune'],
        isPrimary: false,
      },
    ],
    tags: ['AI', 'ML'],
    interesting_score: 9,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Summary details',
    htmlContent: '<p>Summary details</p>',
    summary: 'Vertex AI Model Tuning breaking changes.',
    detailsHtml: '<p>Summary details</p>',
    extractedMethods: ['models.tune'],
    ecosystem: 'AI / Machine Learning',
    category: 'AI & Machine Learning',
  },
  {
    slug: '2026-08-10-bigquery',
    docId: '2026-08-10-bigquery-v2',
    date: '2026-08-10',
    api: 'bigquery.v2',
    version: 'v2',
    service: 'BigQuery',
    service_id: 'bigquery',
    title: 'BigQuery Storage API Enhancements',
    impact: 'medium',
    breaking: false,
    breaking_reasons: [],
    target_paths: ['schemas.table.properties.description'],
    targetPaths: ['schemas.table.properties.description'],
    diff: {
      added: [{ path: 'schemas.table.properties.description', value: { type: 'string' } }],
      removed: [],
      changed: [],
    },
    tags: ['Analytics'],
    interesting_score: 5,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Summary details',
    htmlContent: '<p>Summary details</p>',
    summary: 'BigQuery Storage API enhancements.',
    detailsHtml: '<p>Summary details</p>',
    extractedMethods: ['jobs.insert'],
    ecosystem: 'Data Analytics',
    category: 'Data Analytics',
  },
  {
    slug: '2026-07-01-storage',
    docId: '2026-07-01-storage-v1',
    date: '2026-07-01',
    api: 'storage.v1',
    version: 'v1',
    service: 'Cloud Storage',
    service_id: 'cloud-storage',
    title: 'Cloud Storage Bucket Lifecycle',
    impact: 'low',
    breaking: false,
    tags: ['Storage'],
    interesting_score: 3,
    status: 'canary',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Summary details',
    htmlContent: '<p>Summary details</p>',
    summary: 'Cloud Storage Bucket Lifecycle updates.',
    detailsHtml: '<p>Summary details</p>',
    extractedMethods: ['buckets.patch'],
    ecosystem: 'Infrastructure',
    category: 'Storage',
  },
];

describe('Bounded AST Diff & Target Path Formatting for llms.txt', () => {
  it('truncates target_paths after 15 items and each AST diff bucket after 10 items', () => {
    const oversizedEntry: FeedEntry = {
      ...mockEntries[0],
      target_paths: Array.from({ length: 18 }, (_, i) => `schemas.model.properties.field_${i}`),
      targetPaths: Array.from({ length: 18 }, (_, i) => `schemas.model.properties.field_${i}`),
      diff: {
        added: Array.from({ length: 14 }, (_, i) => ({
          path: `schemas.model.properties.added_${i}`,
          value: 'string',
        })),
        removed: Array.from({ length: 12 }, (_, i) => ({
          path: `schemas.model.properties.removed_${i}`,
          old_value: 'string',
        })),
        changed: Array.from({ length: 11 }, (_, i) => ({
          path: `schemas.model.properties.changed_${i}`,
          old: 'a',
          new: 'b',
        })),
      },
    };

    const output = formatMachineFeedEntryDetails(oversizedEntry).join('\n');

    expect(output).toContain('field_0');
    expect(output).toContain('field_14');
    expect(output).not.toContain('field_15');
    expect(output).toContain('... (+3 more)');

    expect(output).toContain('added_9');
    expect(output).not.toContain('added_10');
    expect(output).toContain('... and 4 more');

    expect(output).toContain('removed_9');
    expect(output).not.toContain('removed_10');
    expect(output).toContain('... and 2 more');

    expect(output).toContain('changed_9');
    expect(output).not.toContain('changed_10');
    expect(output).toContain('... and 1 more');
  });
});

describe('llms.txt & Service llms.txt Structured AST Rendering', () => {
  beforeEach(() => {
    vi.spyOn(feedModule, 'getAllFeedEntries').mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders structured AST diff, breaking reasons, and /api/breaking.json link in llms.txt', async () => {
    const request = new Request('https://google-cloud-radar.com/llms.txt');
    const response = await llmsTxtGET({ request } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');

    const text = await response.text();
    expect(text).toContain('# Google Cloud Radar');
    expect(text).toContain('https://google-cloud-radar.com/api/breaking.json');
    expect(text).toContain('Recent API Changes and Breaking Updates');

    expect(text).toContain('Vertex AI');
    expect(text).toContain('Breaking Reasons:');
    expect(text).toContain("Property 'oldParam' in method 'models.tune' was removed");
    expect(text).toContain('Target Paths:');
    expect(text).toContain('AST Diff:');
    expect(text).toContain('Added:');
    expect(text).toContain('Removed:');
    expect(text).toContain('Changed:');
    expect(text).toContain('BigQuery Storage API Enhancements');
    expect(text).toContain('Cloud Storage Bucket Lifecycle');
  });

  it('renders AST diff details in per-service llms.txt endpoint', async () => {
    const response = await serviceLlmsTxtGET({
      props: {
        serviceInfo: {
          service: 'Vertex AI',
          slug: 'vertex-ai',
          count: 1,
          breakingCount: 1,
          ecosystem: 'AI / Machine Learning',
          category: 'AI & Machine Learning',
        },
        entries: [mockEntries[0]],
      },
    } as any);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('# Vertex AI — Google Cloud Radar');
    expect(text).toContain('Breaking Reasons:');
    expect(text).toContain('AST Diff:');
  });
});

describe('api/feed.json, api/breaking.json & Service feed.json Metadata', () => {
  beforeEach(() => {
    vi.spyOn(feedModule, 'getAllFeedEntries').mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns global JSON feed with target_paths, breaking_reasons, and diff in _gcp_metadata', async () => {
    const request = new Request('https://google-cloud-radar.com/api/feed.json');
    const response = await apiFeedJsonGET({ request } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/feed+json');

    const data = await response.json();
    expect(data.version).toBe('https://jsonfeed.org/version/1.1');
    expect(data.feed_url).toBe('https://google-cloud-radar.com/api/feed.json');
    expect(data.items).toHaveLength(3);

    const item = data.items[0];
    expect(item._gcp_metadata).toBeDefined();
    expect(item._gcp_metadata.breaking_reasons).toEqual([
      "Property 'oldParam' in method 'models.tune' was removed",
    ]);
    expect(item._gcp_metadata.target_paths).toEqual([
      'schemas.model.properties.oldparam',
      'schemas.model.properties.newparam',
    ]);
    expect(item._gcp_metadata.diff).toEqual({
      added: [{ path: 'schemas.model.properties.newparam', value: { type: 'string' } }],
      removed: [{ path: 'schemas.model.properties.oldparam', old_value: { type: 'string' } }],
      changed: [{ path: 'schemas.model.properties.timeout', old: 10, new: 30 }],
    });
  });

  it('returns static /api/breaking.json containing only breaking entries with structured AST diffs', async () => {
    const request = new Request('https://google-cloud-radar.com/api/breaking.json');
    const response = await apiBreakingJsonGET({ request } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/feed+json');

    const data = await response.json();
    expect(data.version).toBe('https://jsonfeed.org/version/1.1');
    expect(data.feed_url).toBe('https://google-cloud-radar.com/api/breaking.json');
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('2026-09-15-aiplatform');
    expect(data.items[0]._gcp_metadata.breaking).toBe(true);
    expect(data.items[0]._gcp_metadata.diff).toEqual(mockEntries[0].diff);
  });

  it('includes breaking_reasons, target_paths, and diff in per-service feed.json', async () => {
    const response = await serviceFeedJsonGET({
      props: {
        serviceInfo: {
          service: 'Vertex AI',
          slug: 'vertex-ai',
        },
        entries: [mockEntries[0], mockEntries[1]],
      },
    } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0]._gcp_metadata.breaking_reasons).toEqual([
      "Property 'oldParam' in method 'models.tune' was removed",
    ]);
    expect(data.items[0]._gcp_metadata.diff.changed).toHaveLength(1);
  });

  it('bounds oversized target_paths and AST diff buckets in JSON feeds and records target_paths_total', () => {
    const oversizedJsonEntry: FeedEntry = {
      ...mockEntries[0],
      target_paths: Array.from({ length: 120 }, (_, i) => `schemas.model.properties.field_${i}`),
      targetPaths: Array.from({ length: 120 }, (_, i) => `schemas.model.properties.field_${i}`),
      diff: {
        added: Array.from({ length: 40 }, (_, i) => ({
          path: `schemas.model.properties.added_${i}`,
          value: 'string',
        })),
        removed: Array.from({ length: 30 }, (_, i) => ({
          path: `schemas.model.properties.removed_${i}`,
          old_value: 'string',
        })),
        changed: Array.from({ length: 28 }, (_, i) => ({
          path: `schemas.model.properties.changed_${i}`,
          old: 'a',
          new: 'b',
        })),
      },
    };

    const item = serializeJsonFeedItem(oversizedJsonEntry, 'https://google-cloud-radar.com', {
      includeMachineDiff: true,
    });

    expect(item._gcp_metadata.target_paths).toHaveLength(MAX_JSON_FEED_TARGET_PATHS);
    expect(item._gcp_metadata.target_paths?.[0]).toBe('schemas.model.properties.field_0');
    expect(item._gcp_metadata.target_paths?.[MAX_JSON_FEED_TARGET_PATHS - 1]).toBe(
      `schemas.model.properties.field_${MAX_JSON_FEED_TARGET_PATHS - 1}`
    );
    expect(item._gcp_metadata.target_paths_total).toBe(120);
    expect(item._gcp_metadata.diff?.added).toHaveLength(MAX_JSON_FEED_DIFF_ITEMS);
    expect(item._gcp_metadata.diff?.removed).toHaveLength(MAX_JSON_FEED_DIFF_ITEMS);
    expect(item._gcp_metadata.diff?.changed).toHaveLength(MAX_JSON_FEED_DIFF_ITEMS);
  });

  it('propagates breaking_reasons, diff, and target_paths from breaking sibling API versions during deduplication', () => {
    const primaryNonBreakingV1: FeedEntry = {
      ...mockEntries[1],
      slug: '2026-11-13-aiplatform',
      docId: '2026-11-13-aiplatform-v1',
      date: '2026-11-13',
      api: 'aiplatform.v1',
      version: 'v1',
      service: 'Vertex AI',
      service_id: 'vertex-ai',
      breaking: false,
      breaking_reasons: undefined,
      target_paths: [],
      targetPaths: [],
      diff: undefined,
      siblingVersions: undefined,
    };

    const breakingSiblingV1beta1: FeedEntry = {
      ...mockEntries[0],
      slug: '2026-11-13-aiplatform',
      docId: '2026-11-13-aiplatform-v1beta1',
      date: '2026-11-13',
      api: 'aiplatform.v1beta1',
      version: 'v1beta1',
      service: 'Vertex AI',
      service_id: 'vertex-ai',
      breaking: true,
      breaking_reasons: ["Required parameter 'model' added in v1beta1"],
      target_paths: ['resources.models.methods.predict.parameters.model'],
      targetPaths: ['resources.models.methods.predict.parameters.model'],
      diff: {
        added: [{ path: 'resources.models.methods.predict.parameters.model.required', value: true }],
        removed: [],
        changed: [],
      },
      siblingVersions: undefined,
    };

    const deduplicated = deduplicateFeedSiblingVersions(
      enrichWithSiblingVersions([primaryNonBreakingV1, breakingSiblingV1beta1])
    );

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].api).toBe('aiplatform.v1');
    expect(deduplicated[0].breaking).toBe(true);
    expect(deduplicated[0].breaking_reasons).toEqual(["Required parameter 'model' added in v1beta1"]);
    expect(deduplicated[0].target_paths).toEqual(['resources.models.methods.predict.parameters.model']);
    expect(deduplicated[0].diff?.added).toHaveLength(1);
  });
});

describe('Feed Writer & Firestore Seeder Persistence of breaking_reasons & diff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar_test_feed_writer_'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists breaking_reasons and diff structure to change json, index.json, and Firestore seed payload', () => {
    const insight = {
      api: 'aiplatform.v1',
      service_name: 'Vertex AI',
      title: 'Vertex Breaking Update',
      summary: 'Summary string',
      details: 'Details string',
      impact: 'high',
      breaking: true,
      breaking_reasons: ['Removed parameter X'],
      target_paths: ['schemas.x.properties.y'],
      diff: {
        added: [{ path: 'schemas.x.properties.z', value: 'string' }],
        removed: [{ path: 'schemas.x.properties.x', old_value: 'string' }],
        changed: [],
      },
      interesting_score: 8,
      tags: ['AI'],
    };

    const slug = writeInsight(insight, '2026-09-20', tmpDir);
    expect(slug).toBe('2026-09-20-aiplatform-v1');

    const changeFilePath = path.join(tmpDir, 'changes', `${slug}.json`);
    expect(fs.existsSync(changeFilePath)).toBe(true);

    const savedDoc = JSON.parse(fs.readFileSync(changeFilePath, 'utf-8'));
    expect(savedDoc.breaking_reasons).toEqual(['Removed parameter X']);
    expect(savedDoc.target_paths).toEqual(['schemas.x.properties.y']);
    expect(savedDoc.diff).toEqual({
      added: [{ path: 'schemas.x.properties.z', value: 'string' }],
      removed: [{ path: 'schemas.x.properties.x', old_value: 'string' }],
      changed: [],
    });

    const indexFilePath = path.join(tmpDir, 'index.json');
    expect(fs.existsSync(indexFilePath)).toBe(true);

    const savedIndex = JSON.parse(fs.readFileSync(indexFilePath, 'utf-8'));
    expect(savedIndex).toHaveLength(1);
    expect(savedIndex[0].breaking_reasons).toEqual(['Removed parameter X']);
    expect(savedIndex[0].diff).toEqual(savedDoc.diff);

    // Verify rebuildIndexFromChanges retains diff as well
    const rebuilt = rebuildIndexFromChanges(tmpDir);
    expect(rebuilt[0].diff).toEqual(savedDoc.diff);

    // Verify Firestore seed parser serializes diff
    const seededDoc = parseJsonChangeFile(changeFilePath);
    expect(JSON.parse(seededDoc.diff)).toEqual(savedDoc.diff);
  });
});
