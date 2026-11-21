import { describe, it, expect, vi } from 'vitest';
import {
  generateBranchName,
  COMMIT_MESSAGE,
  PULL_REQUEST_BODY,
  APPROVAL_MESSAGE,
  REPO_NAME,
  GIT_USER_NAME,
  mergePr,
  updatePr,
  formatPrBody,
  generatePrBody,
} from '../scripts/open_pr.ts';
import * as diffPreprocessor from '../scripts/diff_preprocessor.ts';

describe('open_pr', () => {
  it('generates branch names matching autopr/<hex> format', () => {
    const branch1 = generateBranchName();
    const branch2 = generateBranchName();
    expect(branch1).toMatch(/^autopr\/[0-9a-f]{32}$/);
    expect(branch2).toMatch(/^autopr\/[0-9a-f]{32}$/);
    expect(branch1).not.toBe(branch2);
  });

  it('maintains expected PR metadata constants', () => {
    expect(COMMIT_MESSAGE).toBe('chore: Automated update of discovery documents');
    expect(PULL_REQUEST_BODY).toBe('Automatically created by the update_disco script.');
    expect(APPROVAL_MESSAGE).toBe('Rubber-stamped automated update of discovery documents!');
    expect(REPO_NAME).toBe('max-ostapenko/google-cloud-radar');
    expect(GIT_USER_NAME).toBe('max-ostapenko');
  });

  it('exports mergePr and aliases updatePr to mergePr', () => {
    expect(typeof mergePr).toBe('function');
    expect(updatePr).toBe(mergePr);
  });

  describe('formatPrBody', () => {
    it('returns standard fallback description when diff set is empty', () => {
      expect(formatPrBody([])).toBe(PULL_REQUEST_BODY);
      expect(formatPrBody(null as any)).toBe(PULL_REQUEST_BODY);
    });

    it('formats single-service non-breaking change set correctly', () => {
      const diffs = [
        {
          api: 'storage:v1',
          is_breaking: false,
          breaking_reasons: [],
          extracted_methods: ['storage.objects.insert', 'storage.buckets.get'],
          target_paths: ['resources.objects.methods.insert'],
          _stats: {
            added_count: 5,
            removed_count: 0,
            modified_count: 2,
            is_breaking: false,
            breaking_reasons: [],
          },
        },
      ];

      const body = formatPrBody(diffs);

      expect(body).toContain(PULL_REQUEST_BODY);
      expect(body).toContain('## 📊 Discovery Document Updates');
      expect(body).toContain('- **Services Updated:** 1');
      expect(body).toContain('- **Breaking Changes:** None ✅');
      expect(body).toContain('- **Total Additions:** 5');
      expect(body).toContain('- **Total Removals:** 0');
      expect(body).toContain('- **Total Modifications:** 2');

      // Table formatting
      expect(body).toContain(
        '| `storage:v1` | ✅ Compatible | 5 | 0 | 2 | `storage.objects.insert`, `storage.buckets.get` |'
      );

      // JSON Metadata Block
      const metadataMatch = body.match(/<!--\s*AGENT_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
      expect(metadataMatch).not.toBeNull();
      const metadata = JSON.parse(metadataMatch![1]);
      expect(metadata.version).toBe('1.0');
      expect(metadata.has_breaking_changes).toBe(false);
      expect(metadata.summary.total_services).toBe(1);
      expect(metadata.summary.total_added).toBe(5);
      expect(metadata.services[0].api).toBe('storage:v1');
      expect(metadata.services[0].is_breaking).toBe(false);
    });

    it('formats single-service breaking change set with visual badges and reasons', () => {
      const diffs = [
        {
          api: 'bigquery:v2',
          is_breaking: true,
          breaking_reasons: ["Removed method 'bigquery.datasets.delete'"],
          extracted_methods: ['bigquery.datasets.delete'],
          target_paths: ['resources.datasets.methods.delete'],
          _stats: {
            added_count: 0,
            removed_count: 1,
            modified_count: 0,
            is_breaking: true,
            breaking_reasons: ["Removed method 'bigquery.datasets.delete'"],
          },
        },
      ];

      const body = formatPrBody(diffs);

      expect(body).toContain('- **Breaking Changes:** 1 🚨');
      expect(body).toContain('| `bigquery:v2` | 🚨 BREAKING | 0 | 1 | 0 | `bigquery.datasets.delete` |');
      expect(body).toContain('### 🚨 Breaking Change Details');
      expect(body).toContain("- **`bigquery:v2`**:\n  - Removed method 'bigquery.datasets.delete'");

      const metadataMatch = body.match(/<!--\s*AGENT_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
      expect(metadataMatch).not.toBeNull();
      const metadata = JSON.parse(metadataMatch![1]);
      expect(metadata.has_breaking_changes).toBe(true);
      expect(metadata.summary.breaking_services).toBe(1);
      expect(metadata.services[0].is_breaking).toBe(true);
      expect(metadata.services[0].breaking_reasons).toEqual(["Removed method 'bigquery.datasets.delete'"]);
    });

    it('formats multi-service change set aggregating metrics across services', () => {
      const diffs = [
        {
          api: 'bigquery:v2',
          is_breaking: true,
          breaking_reasons: ["Removed method 'bigquery.datasets.delete'"],
          extracted_methods: ['bigquery.datasets.delete'],
          target_paths: ['resources.datasets.methods.delete'],
          _stats: {
            added_count: 0,
            removed_count: 1,
            modified_count: 0,
            is_breaking: true,
          },
        },
        {
          api: 'storage:v1',
          is_breaking: false,
          breaking_reasons: [],
          extracted_methods: ['storage.objects.insert'],
          target_paths: ['resources.objects.methods.insert'],
          _stats: {
            added_count: 10,
            removed_count: 2,
            modified_count: 3,
            is_breaking: false,
          },
        },
      ];

      const body = formatPrBody(diffs);

      expect(body).toContain('- **Services Updated:** 2');
      expect(body).toContain('- **Breaking Changes:** 1 🚨');
      expect(body).toContain('- **Total Additions:** 10');
      expect(body).toContain('- **Total Removals:** 3');
      expect(body).toContain('- **Total Modifications:** 3');

      expect(body).toContain('`bigquery:v2`');
      expect(body).toContain('`storage:v1`');

      const metadataMatch = body.match(/<!--\s*AGENT_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
      expect(metadataMatch).not.toBeNull();
      const metadata = JSON.parse(metadataMatch![1]);
      expect(metadata.summary.total_services).toBe(2);
      expect(metadata.summary.breaking_services).toBe(1);
      expect(metadata.services.length).toBe(2);
    });

    it('truncates body if size exceeds 60000 characters while preserving valid JSON metadata', () => {
      const hugeDiff = Array.from({ length: 400 }, (_, svcIdx) => ({
        api: `huge_service_${svcIdx}:v1`,
        is_breaking: svcIdx === 0,
        breaking_reasons: svcIdx === 0 ? ['Removed critical method'] : [],
        extracted_methods: Array.from(
          { length: 20 },
          (_, i) => `huge_service_${svcIdx}.resource.methodVeryLongIdentifierName_${i}`
        ),
        target_paths: Array.from(
          { length: 20 },
          (_, i) => `resources.resource.methods.methodVeryLongIdentifierName_${i}`
        ),
        _stats: {
          added_count: 10,
          removed_count: 5,
          modified_count: 3,
          is_breaking: svcIdx === 0,
        },
      }));

      const body = formatPrBody(hugeDiff);
      expect(body.length).toBeLessThanOrEqual(60000);
      expect(body).toContain('AGENT_METADATA');
      const metadataMatch = body.match(/<!--\s*AGENT_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
      expect(metadataMatch).not.toBeNull();
      expect(() => JSON.parse(metadataMatch![1])).not.toThrow();
    });
  });

  describe('generatePrBody', () => {
    it('uses provided diffs if passed explicitly', () => {
      const diffs = [
        {
          api: 'compute:v1',
          is_breaking: false,
          extracted_methods: ['compute.instances.insert'],
          _stats: { added_count: 1, removed_count: 0, modified_count: 0 },
        },
      ];
      const body = generatePrBody(diffs);
      expect(body).toContain('compute:v1');
    });

    it('falls back to extractStructuredDiffs when diffs not provided', () => {
      const mockDiffs = [
        {
          api: 'aiplatform:v1',
          is_breaking: false,
          extracted_methods: ['aiplatform.models.get'],
          _stats: { added_count: 2, removed_count: 0, modified_count: 1 },
        },
      ];

      vi.spyOn(diffPreprocessor, 'extractStructuredDiffs').mockImplementation((base, head) => {
        if (base === 'HEAD' && head === 'WORKTREE') {
          return mockDiffs;
        }
        return [];
      });

      const body = generatePrBody();
      expect(body).toContain('aiplatform:v1');
      vi.restoreAllMocks();
    });

    it('falls back to HEAD~1..HEAD when worktree has no uncommitted discovery diffs', () => {
      const committedDiffs = [
        {
          api: 'run:v2',
          is_breaking: false,
          extracted_methods: ['run.projects.locations.services.create'],
          _stats: { added_count: 3, removed_count: 0, modified_count: 0 },
        },
      ];

      vi.spyOn(diffPreprocessor, 'extractStructuredDiffs').mockImplementation((base, head) => {
        if (base === 'HEAD~1' && head === 'HEAD') {
          return committedDiffs;
        }
        return [];
      });

      const body = generatePrBody();
      expect(body).toContain('run:v2');
      vi.restoreAllMocks();
    });
  });
});
