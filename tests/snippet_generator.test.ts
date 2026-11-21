import { describe, it, expect } from 'vitest';
import {
  generateCodeSnippets,
  generateSchemaDiffPayload,
} from '../scripts/snippet_generator.ts';

describe('Snippet Generator', () => {
  it('generates Python, TypeScript, and cURL snippets for a breaking change', () => {
    const record = {
      api: 'bigquery.v2',
      service: 'BigQuery',
      title: 'Breaking parameter removal',
      summary: 'Parameter `timeout` removed from `jobs.query`',
      breaking: true,
      extracted_methods: ['jobs.query'],
      target_paths: ['methods.jobs.query.parameters.timeout'],
      breaking_reasons: ["Removed parameter 'timeout' from method"],
    };

    const snippets = generateCodeSnippets(record);

    expect(snippets).toHaveProperty('python');
    expect(snippets).toHaveProperty('typescript');
    expect(snippets).toHaveProperty('curl');

    expect(snippets.python).toContain('google.cloud');
    expect(snippets.python).toContain('BigQuery');
    expect(snippets.typescript).toContain('@google-cloud');
    expect(snippets.curl).toContain('curl -X POST');
  });

  it('preserves existing structured code snippets if present', () => {
    const existingSnippets = {
      python: '# custom py',
      typescript: '// custom ts',
      curl: '# custom curl',
    };

    const record = {
      api: 'storage.v1',
      code_snippets: existingSnippets,
    };

    const snippets = generateCodeSnippets(record);
    expect(snippets.python).toBe('# custom py');
    expect(snippets.typescript).toBe('// custom ts');
    expect(snippets.curl).toBe('# custom curl');
  });

  it('formats schema diff payload correctly', () => {
    const diff = {
      added: [{ path: 'schemas.Dataset.properties.location', value: 'string' }],
      removed: [{ path: 'methods.tables.delete.parameters.quotaUser', old_value: 'string' }],
      modified: [{ path: 'schemas.Table.properties.expirationTime.type', old: 'string', new: 'integer' }],
      breaking_reasons: ["Removed parameter 'quotaUser'"],
      target_paths: ['schemas.Dataset.properties.location', 'methods.tables.delete.parameters.quotaUser'],
    };

    const payload = generateSchemaDiffPayload(diff);
    expect(payload.added).toHaveLength(1);
    expect(payload.removed).toHaveLength(1);
    expect(payload.modified).toHaveLength(1);
    expect(payload.breaking_reasons).toContain("Removed parameter 'quotaUser'");
  });

  it('satisfies total JSON size additions constraint (< 10 KB)', () => {
    const record = {
      api: 'bigquery.v2',
      service: 'BigQuery',
      summary: 'Iceberg timestamp autodetection and UDF clarifications',
      extracted_methods: ['tables.patch', 'datasets.insert'],
      target_paths: Array.from({ length: 30 }, (_, i) => `schemas.Table.properties.field_${i}`),
      breaking_reasons: ['Property type changed in schema Table'],
    };

    const snippets = generateCodeSnippets(record);
    const schemaDiff = generateSchemaDiffPayload(record);

    const additionsJson = JSON.stringify({ code_snippets: snippets, schema_diff: schemaDiff });
    const sizeInBytes = Buffer.byteLength(additionsJson, 'utf-8');

    // Requirement: Change JSON payload additions must not exceed 10 Kilobytes (10,240 bytes)
    expect(sizeInBytes).toBeLessThan(10240);
  });
});
