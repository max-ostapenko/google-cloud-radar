import { describe, it, expect } from 'vitest';
import * as diff_preprocessor from '../scripts/diff_preprocessor.ts';

describe('Diff Preprocessor', () => {
  it('build_structured_diff ignores noise only changes', () => {
    const old = {
      revision: '1',
      etag: 'old',
      resources: {
        jobs: {
          methods: {
            get: {
              description: 'Get a job.',
              httpMethod: 'GET',
            },
          },
        },
      },
    };
    const next = {
      revision: '2',
      etag: 'new',
      resources: {
        jobs: {
          methods: {
            get: {
              description: 'Get a job.',
              httpMethod: 'GET',
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).toBeNull();
  });

  it('build_structured_diff groups added removed and modified paths', () => {
    const old = {
      revision: '1',
      resources: {
        jobs: {
          methods: {
            get: {
              httpMethod: 'GET',
              parameters: {
                jobId: { type: 'string' },
                oldFlag: { type: 'boolean' },
              },
            },
          },
        },
      },
    };
    const next = {
      revision: '2',
      resources: {
        jobs: {
          methods: {
            get: {
              httpMethod: 'POST',
              parameters: {
                jobId: { type: 'string' },
                newFlag: { type: 'boolean' },
              },
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.api).toBe('bigquery.v2');
    expect(result!.added).toEqual([
      {
        path: 'resources.jobs.methods.get.parameters.newFlag.type',
        value: 'boolean',
      },
    ]);
    expect(result!.removed).toEqual([
      {
        path: 'resources.jobs.methods.get.parameters.oldFlag.type',
        old_value: 'boolean',
      },
    ]);
    expect(result!.modified).toEqual([
      {
        path: 'resources.jobs.methods.get.httpMethod',
        old: 'GET',
        new: 'POST',
      },
    ]);
    expect(result!._stats.added_count).toBe(1);
    expect(result!._stats.removed_count).toBe(1);
    expect(result!._stats.modified_count).toBe(1);
    expect(result!._stats.description_only_modified).toBe(0);
    expect(result!._stats.is_breaking).toBe(true);
    expect(result!.is_breaking).toBe(true);
  });

  it('build_structured_diff ignores whole document deletion or sweeps', () => {
    const resources: Record<string, any> = {};
    for (let i = 0; i < 50; i++) {
      resources[`res_${i}`] = { methods: { get: { httpMethod: 'GET' } } };
    }
    const old = {
      name: 'libraryagent',
      version: 'v1',
      resources,
    };

    const resDeleted = diff_preprocessor.buildStructuredDiff(
      'libraryagent.v1.json',
      JSON.stringify(old),
      ''
    );
    expect(resDeleted).toBeNull();

    const newGutted = { name: 'libraryagent' };
    const resGutted = diff_preprocessor.buildStructuredDiff(
      'libraryagent.v1.json',
      JSON.stringify(old),
      JSON.stringify(newGutted)
    );
    expect(resGutted).toBeNull();
  });

  it('detect_breaking_changes identifies removed properties and methods', () => {
    const old = {
      resources: {
        datasets: {
          methods: {
            delete: {
              httpMethod: 'DELETE',
              parameters: {
                datasetId: { type: 'string' },
                deleteContents: {
                  type: 'boolean',
                  required: false,
                },
              },
            },
            legacyMethod: {
              httpMethod: 'POST',
            },
          },
        },
      },
      schemas: {
        Dataset: {
          properties: {
            id: { type: 'string' },
            removedField: { type: 'string' },
            typeMutatedField: { type: 'array' },
          },
        },
      },
    };

    const next = {
      resources: {
        datasets: {
          methods: {
            delete: {
              httpMethod: 'DELETE',
              parameters: {
                datasetId: { type: 'string', required: true },
              },
            },
            newMethod: {
              httpMethod: 'GET',
            },
          },
        },
      },
      schemas: {
        Dataset: {
          properties: {
            id: { type: 'string' },
            typeMutatedField: { type: 'object' },
            newField: { type: 'string' },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(true);
    const reasons = result!.breaking_reasons;

    expect(reasons.some((r: string) => r.includes("Removed API method 'legacyMethod'"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("Removed parameter 'deleteContents'"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("Removed property 'removedField'"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("changed type from 'array' to 'object'"))).toBe(true);
    expect(reasons.some((r: string) => r.includes('was changed to strictly required'))).toBe(true);
  });

  it('detect_breaking_changes false for pure additions', () => {
    const old = {
      resources: {
        jobs: {
          methods: {
            query: {
              httpMethod: 'POST',
              parameters: {
                projectId: { type: 'string' },
              },
            },
          },
        },
      },
      schemas: {
        Job: {
          properties: {
            id: { type: 'string' },
          },
        },
      },
    };

    const next = {
      resources: {
        jobs: {
          methods: {
            query: {
              httpMethod: 'POST',
              parameters: {
                projectId: { type: 'string' },
                newOptionalParam: {
                  type: 'boolean',
                  required: false,
                },
              },
            },
            newExtraMethod: {
              httpMethod: 'GET',
            },
          },
        },
      },
      schemas: {
        Job: {
          properties: {
            id: { type: 'string' },
            newResponseField: { type: 'string' },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(false);
    expect(result!.breaking_reasons).toEqual([]);
  });

  it('parameter enum removal flags breaking change', () => {
    const old = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                projection: {
                  type: 'string',
                  enum: ['full', 'minimal'],
                },
              },
            },
          },
        },
      },
    };
    const next = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                projection: {
                  type: 'string',
                  enum: ['full'],
                },
              },
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(true);
    expect(result!._stats.is_breaking).toBe(true);
    const expectedReason = "Removed enum value 'minimal' from parameter 'projection'";
    expect(result!.breaking_reasons).toContain(expectedReason);
    expect(result!._stats.breaking_reasons).toContain(expectedReason);
  });

  it('parameter enum addition is non breaking', () => {
    const old = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                projection: {
                  type: 'string',
                  enum: ['full'],
                },
              },
            },
          },
        },
      },
    };
    const next = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                projection: {
                  type: 'string',
                  enum: ['full', 'minimal'],
                },
              },
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(false);
    expect(result!.breaking_reasons).toEqual([]);
  });

  it('parameter default modification flags breaking change', () => {
    const old = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                maxResults: {
                  type: 'integer',
                  default: '100',
                },
              },
            },
          },
        },
      },
    };
    const next = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                maxResults: {
                  type: 'integer',
                  default: '50',
                },
              },
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(true);
    const expectedReason = "Default value for parameter 'maxResults' changed from '100' to '50'";
    expect(result!.breaking_reasons).toContain(expectedReason);
  });

  it('parameter default removal flags breaking change', () => {
    const old = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                maxResults: {
                  type: 'integer',
                  default: '100',
                },
              },
            },
          },
        },
      },
    };
    const next = {
      resources: {
        jobs: {
          methods: {
            list: {
              httpMethod: 'GET',
              parameters: {
                maxResults: {
                  type: 'integer',
                },
              },
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(true);
    const expectedReason = "Default value for parameter 'maxResults' was removed";
    expect(result!.breaking_reasons).toContain(expectedReason);
  });

  it('schema property enum or default change does not trigger parameter breaking', () => {
    const old = {
      schemas: {
        JobConfig: {
          properties: {
            state: {
              type: 'string',
              enum: ['PENDING', 'RUNNING'],
              default: 'PENDING',
            },
          },
        },
      },
    };
    const next = {
      schemas: {
        JobConfig: {
          properties: {
            state: {
              type: 'string',
              enum: ['PENDING'],
              default: 'RUNNING',
            },
          },
        },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    if (result !== null) {
      expect(result.breaking_reasons).not.toContain("Removed enum value 'RUNNING' from parameter 'state'");
      expect(result.breaking_reasons.some((r: string) => r.includes("parameter 'state'"))).toBe(false);
    }
  });

  it('getFileContentAtRef reads large files without ENOBUFS and handles non-existent paths', () => {
    expect(diff_preprocessor.MAX_GIT_BUFFER).toBeGreaterThanOrEqual(50 * 1024 * 1024);

    // Non-existent path returns empty string
    const missing = diff_preprocessor.getFileContentAtRef('HEAD', 'discoveries/nonexistent_file_xyz.json');
    expect(missing).toBe('');

    // Reading aiplatform.v1.json (3.7MB) should succeed without throwing ENOBUFS
    const content = diff_preprocessor.getFileContentAtRef('HEAD', 'discoveries/aiplatform.v1.json');
    expect(content.length).toBeGreaterThan(1024 * 1024);
  });

  it('detects parameter removal from root service definitions as breaking (2e7659ed)', () => {
    const old = {
      name: 'bigquery',
      version: 'v2',
      parameters: {
        alt: { type: 'string', description: 'Data format for the response.' },
        quotaUser: { type: 'string', description: 'Available to use for quota purposes.' },
      },
    };
    const next = {
      name: 'bigquery',
      version: 'v2',
      parameters: {
        alt: { type: 'string', description: 'Data format for the response.' },
      },
    };

    const result = diff_preprocessor.buildStructuredDiff(
      'bigquery.v2.json',
      JSON.stringify(old),
      JSON.stringify(next)
    );

    expect(result).not.toBeNull();
    expect(result!.is_breaking).toBe(true);
    expect(result!.breaking_reasons).toContain("Removed parameter 'quotaUser' from service");
  });

  describe('isNoisePath (f011a1d9)', () => {
    it('filters top-level document metadata', () => {
      expect(diff_preprocessor.isNoisePath('id')).toBe(true);
      expect(diff_preprocessor.isNoisePath('revision')).toBe(true);
      expect(diff_preprocessor.isNoisePath('etag')).toBe(true);
      expect(diff_preprocessor.isNoisePath('rootUrl')).toBe(true);
      expect(diff_preprocessor.isNoisePath('servicePath')).toBe(true);
      expect(diff_preprocessor.isNoisePath('endpoints[0].location')).toBe(true);
    });

    it('does NOT filter resource or schema properties named id', () => {
      expect(diff_preprocessor.isNoisePath('schemas.Job.properties.id')).toBe(false);
      expect(diff_preprocessor.isNoisePath('schemas.Dataset.properties.id.type')).toBe(false);
      expect(diff_preprocessor.isNoisePath('parameters.id')).toBe(false);
      expect(diff_preprocessor.isNoisePath('resources.tables.methods.get.parameters.tableId')).toBe(false);
    });
  });
});

