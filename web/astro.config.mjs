import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexFilePath = path.resolve(__dirname, '../data/index.json');
const changeMap = new Map();

if (fs.existsSync(indexFilePath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
    for (const item of raw) {
      if (item.id || item.slug) {
        changeMap.set(item.id || item.slug, item);
      }
    }
  } catch (err) {
    console.warn('Failed to load data/index.json for sitemap serialization:', err.message);
  }
}

// https://astro.build/config
export default defineConfig({
  site: 'https://google-cloud-radar.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/breaking') && !page.includes('/404'),
      serialize(item) {
        const changeMatch = item.url.match(/\/changes\/([^/]+)/);
        if (changeMatch) {
          const slug = changeMatch[1];
          const change = changeMap.get(slug);
          if (change) {
            item.lastmod = new Date(`${change.date}T00:00:00Z`).toISOString();
            item.priority = change.breaking ? 0.9 : 0.7;
          } else {
            const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              item.lastmod = new Date(`${dateMatch[1]}T00:00:00Z`).toISOString();
            }
            item.priority = 0.7;
          }
          item.changefreq = 'never';
        } else if (item.url === 'https://google-cloud-radar.com' || item.url === 'https://google-cloud-radar.com/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
          item.lastmod = new Date().toISOString();
        } else if (item.url.includes('/services/')) {
          item.priority = 0.8;
          item.changefreq = 'daily';
        } else if (item.url.includes('/stats')) {
          item.priority = 0.8;
          item.changefreq = 'daily';
        }
        return item;
      },
    }),
  ],
});
