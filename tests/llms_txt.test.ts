import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET } from '../web/src/pages/llms.txt.ts';
import { GET as GET_WELL_KNOWN } from '../web/src/pages/.well-known/llms.txt.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

describe('LLMs.txt Context Stream & Discovery', () => {
  it('returns full unpaginated change history without 30-item truncation cap', async () => {
    const request = new Request('https://google-cloud-radar.com/llms.txt');
    const response = await GET({ request } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const text = await response.text();
    expect(text).toContain('# Google Cloud Radar');
    expect(text).toContain('## Recent API Changes and Breaking Updates');

    // Count occurrence of change entries (each starts with ### [YYYY-MM-DD])
    const changeMatches = text.match(/^### \[/gm);
    expect(changeMatches).not.toBeNull();
    // Verify changes count is greater than 30 (i.e. no 30-item truncation)
    expect(changeMatches!.length).toBeGreaterThan(30);
  });

  it('re-exports identical handler at /.well-known/llms.txt', async () => {
    const request = new Request('https://google-cloud-radar.com/.well-known/llms.txt');
    const response = await GET_WELL_KNOWN({ request } as any);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('# Google Cloud Radar');
    expect(text).toContain('## Machine-Readable Service Feeds & Endpoints');
  });

  it('includes machine-readable feed references and monitored service links', async () => {
    const request = new Request('https://google-cloud-radar.com/llms.txt');
    const response = await GET({ request } as any);
    const text = await response.text();

    expect(text).toContain('## Machine-Readable Service Feeds & Endpoints');
    expect(text).toContain('[Global RSS Feed](https://google-cloud-radar.com/rss.xml)');
    expect(text).toContain('[Global Atom Feed](https://google-cloud-radar.com/atom.xml)');
    expect(text).toContain('[Global JSON Feed](https://google-cloud-radar.com/api/feed.json)');
    expect(text).toContain('[Velocity Stats JSON](https://google-cloud-radar.com/api/stats.json)');
    expect(text).toContain('https://google-cloud-radar.com/services/');
    expect(text).toContain('/llms.txt, JSON Feed:');
  });

  it('supports stream pagination query parameters and navigation links', async () => {
    const requestPage1 = new Request('https://google-cloud-radar.com/llms.txt?page=1&limit=15');
    const responsePage1 = await GET({ request: requestPage1 } as any);
    const textPage1 = await responsePage1.text();

    expect(textPage1).toContain('## API Changes and Breaking Updates (Page 1 of');
    const page1Matches = textPage1.match(/^### \[/gm);
    expect(page1Matches).not.toBeNull();
    expect(page1Matches!.length).toBe(15);

    expect(textPage1).toContain('## Stream Pagination Links');
    expect(textPage1).toContain('[First Page](https://google-cloud-radar.com/llms.txt?page=1&limit=15)');
    expect(textPage1).not.toContain('[Previous Page]');
    expect(textPage1).toContain('[Next Page](https://google-cloud-radar.com/llms.txt?page=2&limit=15)');
    expect(textPage1).toContain('[Full Unpaginated Stream](https://google-cloud-radar.com/llms.txt?page=all)');

    const requestPage2 = new Request('https://google-cloud-radar.com/llms.txt?page=2&limit=15');
    const responsePage2 = await GET({ request: requestPage2 } as any);
    const textPage2 = await responsePage2.text();

    expect(textPage2).toContain('## API Changes and Breaking Updates (Page 2 of');
    expect(textPage2).toContain('[Previous Page](https://google-cloud-radar.com/llms.txt?page=1&limit=15)');
  });

  it('BaseLayout includes alternate link discovery tag in head', () => {
    const layoutPath = path.resolve(REPO_ROOT, 'web/src/layouts/BaseLayout.astro');
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

    expect(layoutContent).toContain('<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM Context Feed" />');
  });

  it('robots.txt includes explicit pointer to llms.txt and preserves AI crawler directives', () => {
    const robotsPath = path.resolve(REPO_ROOT, 'web/public/robots.txt');
    const robotsContent = fs.readFileSync(robotsPath, 'utf-8');

    expect(robotsContent).toContain('User-agent: GPTBot');
    expect(robotsContent).toContain('llms-txt: https://google-cloud-radar.com/llms.txt');
  });
});
