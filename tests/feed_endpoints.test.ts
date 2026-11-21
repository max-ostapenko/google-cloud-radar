import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as feedModule from '../web/src/lib/feed';
import {
  filterFeedEntries,
  parseLimitParam,
  type FeedEntry,
} from '../web/src/lib/feed';
import { GET as llmsTxtGET } from '../web/src/pages/llms.txt';
import { GET as serviceLlmsTxtGET } from '../web/src/pages/services/[service]/llms.txt';
import { GET as apiFeedJsonGET } from '../web/src/pages/api/feed.json';
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

describe('Machine Feed Query Filtering & Limit Clamping', () => {
  it('filters by breaking parameter', () => {
    const breakingOnly = filterFeedEntries(mockEntries, { breaking: 'true' });
    expect(breakingOnly).toHaveLength(1);
    expect(breakingOnly[0].service).toBe('Vertex AI');

    const nonBreaking = filterFeedEntries(mockEntries, { breaking: 'false' });
    expect(nonBreaking).toHaveLength(2);
  });

  it('filters by impact parameter (including impact=breaking)', () => {
    const highImpact = filterFeedEntries(mockEntries, { impact: 'high' });
    expect(highImpact).toHaveLength(1);
    expect(highImpact[0].api).toBe('aiplatform.v1');

    const breakingImpact = filterFeedEntries(mockEntries, { impact: 'breaking' });
    expect(breakingImpact).toHaveLength(1);
    expect(breakingImpact[0].breaking).toBe(true);
  });

  it('filters by service and api parameter (including sibling versions)', () => {
    const vertex = filterFeedEntries(mockEntries, { service: 'vertex-ai' });
    expect(vertex).toHaveLength(1);

    const bigquery = filterFeedEntries(mockEntries, { api: 'bigquery' });
    expect(bigquery).toHaveLength(1);

    const siblingBeta = filterFeedEntries(mockEntries, { api: 'aiplatform.v1beta1' });
    expect(siblingBeta).toHaveLength(1);
    expect(siblingBeta[0].slug).toBe('2026-09-15-aiplatform');
  });

  it('filters by since date parameter', () => {
    const sinceAug = filterFeedEntries(mockEntries, { since: '2026-08-01' });
    expect(sinceAug).toHaveLength(2);
  });

  it('clamps limit parameter between 1 and 100', () => {
    expect(parseLimitParam('0', 30)).toBe(1);
    expect(parseLimitParam('-10', 30)).toBe(1);
    expect(parseLimitParam('150', 30)).toBe(100);
    expect(parseLimitParam('25', 30)).toBe(25);
    expect(parseLimitParam(undefined, 30)).toBe(30);
    expect(parseLimitParam('invalid', 30)).toBe(30);
  });
});

describe('llms.txt & Service llms.txt Endpoint Filtering & AST Rendering', () => {
  beforeEach(() => {
    vi.spyOn(feedModule, 'getAllFeedEntries').mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders structured AST diff and breaking reasons in llms.txt text response', async () => {
    const request = new Request('https://google-cloud-radar.com/llms.txt?breaking=true');
    const response = await llmsTxtGET({ request } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');

    const text = await response.text();
    expect(text).toContain('# Google Cloud Radar');
    expect(text).toContain('Recent API Changes and Breaking Updates');

    expect(text).toContain('Vertex AI');
    expect(text).toContain('Breaking Reasons:');
    expect(text).toContain("Property 'oldParam' in method 'models.tune' was removed");
    expect(text).toContain('Target Paths:');
    expect(text).toContain('AST Diff:');
    expect(text).toContain('Added:');
    expect(text).toContain('Removed:');
    expect(text).toContain('Changed:');

    // Non-breaking entries excluded
    expect(text).not.toContain('Cloud Storage');
  });

  it('renders AST diff details and filters per-service llms.txt endpoint', async () => {
    const request = new Request('https://google-cloud-radar.com/services/vertex-ai/llms.txt?breaking=true');
    const response = await serviceLlmsTxtGET({
      request,
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

describe('api/feed.json & Service feed.json Endpoint Filtering & Metadata', () => {
  beforeEach(() => {
    vi.spyOn(feedModule, 'getAllFeedEntries').mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JSON feed with target_paths, breaking_reasons, and diff in _gcp_metadata', async () => {
    const request = new Request('https://google-cloud-radar.com/api/feed.json?impact=high');
    const response = await apiFeedJsonGET({ request } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/feed+json');

    const data = await response.json();
    expect(data.version).toBe('https://jsonfeed.org/version/1.1');
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(1);

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

  it('includes breaking_reasons, target_paths, and diff in per-service feed.json', async () => {
    const request = new Request('https://google-cloud-radar.com/services/vertex-ai/feed.json?limit=1');
    const response = await serviceFeedJsonGET({
      request,
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
    expect(data.items).toHaveLength(1);
    expect(data.items[0]._gcp_metadata.breaking_reasons).toEqual([
      "Property 'oldParam' in method 'models.tune' was removed",
    ]);
    expect(data.items[0]._gcp_metadata.diff.changed).toHaveLength(1);
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
