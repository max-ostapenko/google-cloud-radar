import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATS_ASTRO_PATH = path.resolve(__dirname, '../web/src/pages/stats.astro');

interface DataDownloadSchema {
  '@type': string;
  encodingFormat: string;
  contentUrl: string;
}

interface DatasetSchema {
  '@context': string;
  '@type': string;
  url?: string;
  distribution?: DataDownloadSchema[];
  [key: string]: unknown;
}

function extractBalancedObjectLiteral(source: string, startBraceIndex: number): string {
  let depth = 0;
  let quote: string | null = null;

  for (let i = startBraceIndex; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      const newlineIdx = source.indexOf('\n', i + 2);
      if (newlineIdx === -1) break;
      i = newlineIdx;
      continue;
    }

    if (ch === '/' && next === '*') {
      const endCommentIdx = source.indexOf('*/', i + 2);
      if (endCommentIdx === -1) break;
      i = endCommentIdx + 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startBraceIndex, i + 1);
      }
    }
  }

  throw new Error('Unbalanced object literal for schemaData in web/src/pages/stats.astro');
}

function loadStatsSchemaData(): { schemaData: DatasetSchema; templateContent: string } {
  const raw = fs.readFileSync(STATS_ASTRO_PATH, 'utf-8');
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error('Failed to parse Astro frontmatter in web/src/pages/stats.astro');
  }

  const [, frontmatter, templateContent] = frontmatterMatch;
  const declMatch = /\bconst\s+schemaData\s*=\s*\{/.exec(frontmatter);
  if (!declMatch) {
    throw new Error('Could not find schemaData variable declaration in web/src/pages/stats.astro');
  }

  const startBraceIdx = declMatch.index + declMatch[0].length - 1;
  const objectLiteral = extractBalancedObjectLiteral(frontmatter, startBraceIdx);
  const evaluated = vm.runInNewContext(`(${objectLiteral})`, Object.create(null));
  const schemaData = JSON.parse(JSON.stringify(evaluated)) as DatasetSchema;

  return { schemaData, templateContent };
}

describe('stats page Dataset JSON-LD schema', () => {
  it('defines a Dataset schema wired into BaseLayout', () => {
    const { schemaData, templateContent } = loadStatsSchemaData();

    expect(schemaData['@context']).toBe('https://schema.org');
    expect(schemaData['@type']).toBe('Dataset');
    expect(schemaData.url).toBe('https://google-cloud-radar.com/stats');
    expect(templateContent).toContain('schemaData={schemaData}');
  });

  it('includes distribution DataDownload items for JSON and RSS feeds with absolute HTTPS URLs', () => {
    const { schemaData } = loadStatsSchemaData();

    expect(Array.isArray(schemaData.distribution)).toBe(true);
    const distributions = schemaData.distribution ?? [];
    expect(distributions).toHaveLength(2);

    for (const item of distributions) {
      expect(item['@type']).toBe('DataDownload');
      expect(typeof item.encodingFormat).toBe('string');
      expect(item.encodingFormat.length).toBeGreaterThan(0);

      // Google Dataset Search requires full canonical HTTP/HTTPS URLs, not relative paths
      const parsedUrl = new URL(item.contentUrl);
      expect(parsedUrl.protocol).toBe('https:');
      expect(parsedUrl.origin).toBe('https://google-cloud-radar.com');
    }

    expect(distributions).toContainEqual({
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: 'https://google-cloud-radar.com/api/feed.json',
    });

    expect(distributions).toContainEqual({
      '@type': 'DataDownload',
      encodingFormat: 'application/rss+xml',
      contentUrl: 'https://google-cloud-radar.com/rss.xml',
    });
  });
});
