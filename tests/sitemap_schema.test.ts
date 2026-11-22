import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function extractJsonLdBlocks(html: string): Record<string, any>[] {
  const openTag = '<script type="application/ld+json">';
  const closeTag = '</script>';
  const blocks: Record<string, any>[] = [];
  let searchFrom = 0;

  while (true) {
    const startIdx = html.indexOf(openTag, searchFrom);
    if (startIdx === -1) break;
    const contentStart = startIdx + openTag.length;
    const endIdx = html.indexOf(closeTag, contentStart);
    if (endIdx === -1) break;
    blocks.push(JSON.parse(html.slice(contentStart, endIdx)));
    searchFrom = endIdx + closeTag.length;
  }

  return blocks;
}

describe('Sitemap and Schema Indexing Integration', () => {
  it('astro.config.mjs sitemap filter excludes /breaking and /404, and filters non-indexable change pages', () => {
    const configPath = path.resolve(REPO_ROOT, 'web/astro.config.mjs');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    expect(configContent).toContain("page.includes('/breaking')");
    expect(configContent).toContain("page.includes('/404')");
    expect(configContent).toContain('isIndexableChangeDoc');
  });

  it('page templates define structured CollectionPage, TechArticle, and BreadcrumbList schemas', () => {
    const serviceTemplate = fs.readFileSync(
      path.resolve(REPO_ROOT, 'web/src/pages/services/[service].astro'),
      'utf-8'
    );
    expect(serviceTemplate).toContain('"@type": "CollectionPage"');
    expect(serviceTemplate).toContain('"@type": "ItemList"');
    expect(serviceTemplate).toContain('schemaData={schemaData}');

    const changeTemplate = fs.readFileSync(
      path.resolve(REPO_ROOT, 'web/src/pages/changes/[slug].astro'),
      'utf-8'
    );
    expect(changeTemplate).toContain('"@type": "TechArticle"');
    expect(changeTemplate).toContain('entry.official_release_date || entry.date');
    expect(changeTemplate).toContain('mainEntityOfPage');
    expect(changeTemplate).toContain('schemaData={schemaData}');

    const timelineTemplate = fs.readFileSync(
      path.resolve(REPO_ROOT, 'web/src/pages/timeline/[month].astro'),
      'utf-8'
    );
    expect(timelineTemplate).toContain('"@type": "CollectionPage"');
    expect(timelineTemplate).toContain('mainEntityOfPage');
    expect(timelineTemplate).toContain('schemaData={schemaData}');

    const breadcrumbsTemplate = fs.readFileSync(
      path.resolve(REPO_ROOT, 'web/src/components/Breadcrumbs.astro'),
      'utf-8'
    );
    expect(breadcrumbsTemplate).toContain("'@type': 'BreadcrumbList'");
    expect(breadcrumbsTemplate).toContain('position: index + 1');
  });

  it('generated dist output (when built) excludes /breaking and /404 from sitemap-0.xml', () => {
    const sitemapPath = path.resolve(REPO_ROOT, 'web/dist/sitemap-0.xml');
    if (!fs.existsSync(sitemapPath)) return;

    const content = fs.readFileSync(sitemapPath, 'utf-8');
    expect(content).not.toContain('<loc>https://google-cloud-radar.com/breaking</loc>');
    expect(content).not.toContain('https://google-cloud-radar.com/404');
  });

  it('service page generated HTML (when built) emits compliant CollectionPage and BreadcrumbList schemas', () => {
    const servicesDistDir = path.resolve(REPO_ROOT, 'web/dist/services');
    if (!fs.existsSync(servicesDistDir)) return;

    const sampleSlug = fs
      .readdirSync(servicesDistDir)
      .find((entry) => fs.existsSync(path.join(servicesDistDir, entry, 'index.html')));
    expect(sampleSlug).toBeDefined();

    const html = fs.readFileSync(path.join(servicesDistDir, sampleSlug!, 'index.html'), 'utf-8');
    const schemas = extractJsonLdBlocks(html);
    expect(schemas.length).toBeGreaterThanOrEqual(2);

    const collectionPage = schemas.find((s) => s['@type'] === 'CollectionPage');
    expect(collectionPage).toBeDefined();
    expect(collectionPage!.url).toBe(`https://google-cloud-radar.com/services/${sampleSlug}`);
    expect(collectionPage!.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': `https://google-cloud-radar.com/services/${sampleSlug}`,
    });
    expect(collectionPage!.mainEntity?.['@type']).toBe('ItemList');
    expect(Array.isArray(collectionPage!.mainEntity?.itemListElement)).toBe(true);

    const breadcrumbList = schemas.find((s) => s['@type'] === 'BreadcrumbList');
    expect(breadcrumbList).toBeDefined();
    expect(breadcrumbList!.itemListElement.length).toBeGreaterThanOrEqual(2);
    breadcrumbList!.itemListElement.forEach((item: any, idx: number) => {
      expect(item.position).toBe(idx + 1);
      expect(item.name).toBeTruthy();
      expect(item.item).toMatch(/^https:\/\/google-cloud-radar\.com/);
    });
  });

  it('change and timeline generated HTML (when built) emit compliant TechArticle and CollectionPage schemas', () => {
    const changesDistDir = path.resolve(REPO_ROOT, 'web/dist/changes');
    if (fs.existsSync(changesDistDir)) {
      const sampleChangeSlug = fs
        .readdirSync(changesDistDir)
        .find((entry) => fs.existsSync(path.join(changesDistDir, entry, 'index.html')));
      expect(sampleChangeSlug).toBeDefined();

      const changeHtml = fs.readFileSync(
        path.join(changesDistDir, sampleChangeSlug!, 'index.html'),
        'utf-8'
      );
      const changeSchemas = extractJsonLdBlocks(changeHtml);
      const techArticle = changeSchemas.find((s) => s['@type'] === 'TechArticle');
      expect(techArticle).toBeDefined();
      expect(techArticle!.url).toBe(`https://google-cloud-radar.com/changes/${sampleChangeSlug}`);
      expect(techArticle!.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': `https://google-cloud-radar.com/changes/${sampleChangeSlug}`,
      });
      expect(techArticle!.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(techArticle!.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const timelineDistDir = path.resolve(REPO_ROOT, 'web/dist/timeline');
    if (fs.existsSync(timelineDistDir)) {
      const sampleMonth = fs
        .readdirSync(timelineDistDir)
        .find((entry) => fs.existsSync(path.join(timelineDistDir, entry, 'index.html')));
      expect(sampleMonth).toBeDefined();

      const timelineHtml = fs.readFileSync(
        path.join(timelineDistDir, sampleMonth!, 'index.html'),
        'utf-8'
      );
      const timelineSchemas = extractJsonLdBlocks(timelineHtml);
      const collectionPage = timelineSchemas.find((s) => s['@type'] === 'CollectionPage');
      expect(collectionPage).toBeDefined();
      expect(collectionPage!.url).toBe(`https://google-cloud-radar.com/timeline/${sampleMonth}`);
      expect(collectionPage!.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': `https://google-cloud-radar.com/timeline/${sampleMonth}`,
      });
      expect(collectionPage!.mainEntity?.['@type']).toBe('ItemList');
      expect(Array.isArray(collectionPage!.mainEntity?.itemListElement)).toBe(true);
    }
  });
});
