import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OPENSEARCH_PATH = path.resolve(REPO_ROOT, 'web/public/opensearch.xml');
const BASE_LAYOUT_PATH = path.resolve(REPO_ROOT, 'web/src/layouts/BaseLayout.astro');

describe('OpenSearch Integration', () => {
  it('opensearch.xml exists and is valid OpenSearch 1.1 XML descriptor', () => {
    expect(fs.existsSync(OPENSEARCH_PATH)).toBe(true);
    const content = fs.readFileSync(OPENSEARCH_PATH, 'utf-8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">');

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(content);
    const desc = parsed.OpenSearchDescription;

    expect(desc).toBeDefined();
    expect(desc.ShortName).toBe('Google Cloud Radar');
    expect(desc.Description).toBeDefined();
    expect(desc.InputEncoding).toBe('UTF-8');
    expect(desc.Image['#text']).toBe('https://google-cloud-radar.com/favicon.ico');
    expect(desc.Url['@_template']).toBe('https://google-cloud-radar.com/?q={searchTerms}');
    expect(desc.Url['@_type']).toBe('text/html');
  });

  it('BaseLayout.astro contains search autodiscovery link tag', () => {
    expect(fs.existsSync(BASE_LAYOUT_PATH)).toBe(true);
    const layoutContent = fs.readFileSync(BASE_LAYOUT_PATH, 'utf-8');
    expect(layoutContent).toContain('rel="search"');
    expect(layoutContent).toContain('type="application/opensearchdescription+xml"');
    expect(layoutContent).toContain('title="Google Cloud Radar"');
    expect(layoutContent).toContain('href="/opensearch.xml"');
  });
});
