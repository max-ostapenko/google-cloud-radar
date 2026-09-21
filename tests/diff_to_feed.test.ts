import { describe, it, expect } from 'vitest';
import {
  extractMethodAndPathMetadata,
  isDuplicateDiff,
} from '../scripts/diff_to_feed.ts';

describe('Diff To Feed Deduplication', () => {
  it('extract_method_and_path_metadata', () => {
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get'],
      target_paths: ['schemas.Job.properties.status.type'],
    };
    const [methods, paths] = extractMethodAndPathMetadata(diff);
    expect(methods).toEqual(new Set(['jobs.get']));
    expect(paths).toEqual(new Set(['schemas.job.properties.status.type']));
  });

  it('extract_method_and_path_metadata_fallback', () => {
    const diff = {
      api: 'bigquery.v2',
      added: [
        {
          path: 'resources.jobs.methods.get.parameters.newParam.type',
          value: 'string',
        },
        { path: 'schemas.Job.properties.version.type', value: 'string' },
      ],
      modified: [
        {
          path: 'schemas.Job.properties.status.type',
          old: 'string',
          new: 'integer',
        },
      ],
    };
    const [methods, paths] = extractMethodAndPathMetadata(diff);
    expect(methods).toEqual(new Set(['jobs.get']));
    expect(paths).toEqual(
      new Set([
        'resources.jobs.methods.get.parameters.newparam.type',
        'schemas.job.properties.version.type',
        'schemas.job.properties.status.type',
      ])
    );
  });

  it('is_duplicate_diff exact duplicate suppressed', () => {
    const history = [
      {
        slug: '2026-08-01-bigquery-v2',
        date: '2026-08-01',
        extracted_methods: ['jobs.get'],
        target_paths: ['schemas.job.properties.status.type'],
        content: 'Summary: BigQuery updated status field. Details: None',
      },
    ];
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get'],
      target_paths: ['schemas.job.properties.status.type'],
    };
    const [isDup, reason] = isDuplicateDiff(diff, history);
    expect(isDup).toBe(true);
    expect(reason).toContain('Identical method set');
  });

  it('is_duplicate_diff distinct common property name published', () => {
    const history = [
      {
        slug: '2026-08-01-bigquery-v2',
        date: '2026-08-01',
        extracted_methods: ['jobs.get'],
        target_paths: ['schemas.job.properties.status.type'],
        content: 'Summary: BigQuery status and version updates. Details: None',
      },
    ];
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get'],
      target_paths: ['schemas.job.properties.version.type'],
    };
    const [isDup, reason] = isDuplicateDiff(diff, history);
    expect(isDup).toBe(false);
    expect(reason).toBe('');
  });

  it('is_duplicate_diff partial overlap methods published', () => {
    const history = [
      {
        slug: '2026-08-01-bigquery-v2',
        date: '2026-08-01',
        extracted_methods: ['jobs.get'],
        target_paths: ['schemas.job.properties.status.type'],
      },
    ];
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get', 'jobs.list'],
      target_paths: ['schemas.job.properties.status.type'],
    };
    const [isDup] = isDuplicateDiff(diff, history);
    expect(isDup).toBe(false);
  });

  it('is_duplicate_diff partial overlap paths published', () => {
    const history = [
      {
        slug: '2026-08-01-bigquery-v2',
        date: '2026-08-01',
        extracted_methods: ['jobs.get'],
        target_paths: ['schemas.job.properties.status.type'],
      },
    ];
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get'],
      target_paths: [
        'schemas.job.properties.status.type',
        'schemas.job.properties.version.type',
      ],
    };
    const [isDup] = isDuplicateDiff(diff, history);
    expect(isDup).toBe(false);
  });

  it('is_duplicate_diff backward compatibility with legacy history', () => {
    const history = [
      {
        slug: '2026-05-01-bigquery-v2',
        date: '2026-05-01',
        content: 'Summary: BigQuery jobs.get updated status field.',
      },
    ];
    const diff = {
      api: 'bigquery.v2',
      extracted_methods: ['jobs.get'],
      target_paths: ['schemas.job.properties.status.type'],
    };
    const [isDup] = isDuplicateDiff(diff, history);
    expect(isDup).toBe(false);
  });
});
