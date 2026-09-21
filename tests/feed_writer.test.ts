import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import * as feed_writer from '../scripts/feed_writer.ts';

const TMP_DATA_DIR = path.join(os.tmpdir(), 'radar_test_feed_data');

function makeInsight(api = 'bigquery.v2', score = 5): Record<string, any> {
  return {
    api,
    service_name: 'BigQuery',
    title: 'BigQuery adds a useful flag',
    summary: 'A short summary.',
    details: 'More detail about the changed API surface.',
    impact: 'medium',
    breaking: false,
    tags: ['bigquery', 'jobs'],
    interesting_score: score,
  };
}

describe('Feed Writer', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_DATA_DIR)) {
      fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP_DATA_DIR)) {
      fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('write_insight creates json and index entry', () => {
    const slug = feed_writer.writeInsight(makeInsight(), '2026-04-17', TMP_DATA_DIR);
    expect(slug).toBe('2026-04-17-bigquery-v2');

    const jsonPath = path.join(TMP_DATA_DIR, 'changes/2026-04-17-bigquery-v2.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(doc.date).toBe('2026-04-17');
    expect(doc.api).toBe('bigquery.v2');
    expect(doc.title).toBe('BigQuery adds a useful flag');
    expect(doc.service).toBe('BigQuery');

    const indexPath = path.join(TMP_DATA_DIR, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    expect(index.length).toBe(1);
    expect(index[0].id).toBe('2026-04-17-bigquery-v2');
    expect(index[0].api).toBe('bigquery.v2');
    expect(index[0].tags).toEqual(['bigquery', 'jobs']);
  });

  it('write_insight persists methods and target paths', () => {
    const insight = makeInsight();
    insight.extracted_methods = ['jobs.get'];
    insight.target_paths = ['schemas.Job.properties.status.type'];

    const slug = feed_writer.writeInsight(insight, '2026-04-17', TMP_DATA_DIR);
    const [, recentHistory] = feed_writer.getRecentFeedEntries('bigquery.v2', '2026-04-18', 3, TMP_DATA_DIR);

    const jsonPath = path.join(TMP_DATA_DIR, `changes/${slug}.json`);
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(doc.extracted_methods).toEqual(['jobs.get']);
    expect(doc.target_paths).toEqual(['schemas.Job.properties.status.type']);

    const indexPath = path.join(TMP_DATA_DIR, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    expect(index[0].extracted_methods).toEqual(['jobs.get']);
    expect(index[0].target_paths).toEqual(['schemas.Job.properties.status.type']);

    expect(recentHistory.length).toBe(1);
    expect(recentHistory[0].extracted_methods).toEqual(['jobs.get']);
    expect(recentHistory[0].target_paths).toEqual(['schemas.Job.properties.status.type']);
  });

  it('write_insight updates in place for same api and date', () => {
    const first = feed_writer.writeInsight(makeInsight(), '2026-04-17', TMP_DATA_DIR);
    const second = feed_writer.writeInsight(makeInsight('bigquery.v2', 7), '2026-04-17', TMP_DATA_DIR);

    expect(first).toBe('2026-04-17-bigquery-v2');
    expect(second).toBe('2026-04-17-bigquery-v2');

    const jsonPath = path.join(TMP_DATA_DIR, 'changes/2026-04-17-bigquery-v2.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const indexPath = path.join(TMP_DATA_DIR, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    expect(index.length).toBe(1);
    expect(index[0].interesting_score).toBe(7);
  });

  it('write_insight skips scores below threshold', () => {
    const slug = feed_writer.writeInsight(makeInsight('bigquery.v2', 1), '2026-04-17', TMP_DATA_DIR);
    expect(slug).toBeNull();
    const changesDir = path.join(TMP_DATA_DIR, 'changes');
    expect(fs.existsSync(changesDir)).toBe(false);
  });
});
