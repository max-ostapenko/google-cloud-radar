import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('OpenGraph Image Property Standardization', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('BaseLayout accepts ogImage and image alias in Props interface and evaluates fallback', () => {
    const baseLayoutPath = path.join(rootDir, 'web/src/layouts/BaseLayout.astro');
    const content = fs.readFileSync(baseLayoutPath, 'utf-8');

    expect(content).toContain('ogImage?: string;');
    expect(content).toContain('image?: string;');
    expect(content).toMatch(/const ogImage = Astro\.props\.ogImage \|\| Astro\.props\.image \|\| "\/og-image\.png";/);
  });

  it('timeline/[month].astro uses ogImage="/og-image.png"', () => {
    const timelinePath = path.join(rootDir, 'web/src/pages/timeline/[month].astro');
    const content = fs.readFileSync(timelinePath, 'utf-8');

    expect(content).toContain('ogImage="/og-image.png"');
    expect(content).not.toContain('image="https://google-cloud-radar.com/og-image.png"');
  });

  it('services/[service].astro provides ogImage="/og-image.png"', () => {
    const servicePath = path.join(rootDir, 'web/src/pages/services/[service].astro');
    const content = fs.readFileSync(servicePath, 'utf-8');

    expect(content).toContain('ogImage="/og-image.png"');
  });

  it('built HTML files contain og:image and twitter:image meta tags', () => {
    const distDir = path.join(rootDir, 'web/dist');
    if (!fs.existsSync(distDir)) {
      return; // dist generated on build
    }

    const timelineHtml = fs.readFileSync(path.join(distDir, 'timeline/2026-10/index.html'), 'utf-8');
    expect(timelineHtml).toContain('<meta property="og:image" content="https://google-cloud-radar.com/og-image.png">');
    expect(timelineHtml).toContain('<meta name="twitter:image" content="https://google-cloud-radar.com/og-image.png">');

    const serviceHtml = fs.readFileSync(path.join(distDir, 'services/vertex-ai/index.html'), 'utf-8');
    expect(serviceHtml).toContain('<meta property="og:image" content="https://google-cloud-radar.com/og-image.png">');
    expect(serviceHtml).toContain('<meta name="twitter:image" content="https://google-cloud-radar.com/og-image.png">');
  });
});
