import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const changesDirPath = path.resolve(__dirname, '../data/changes');
const indexFilePath = path.resolve(__dirname, '../data/index.json');
const changeMap = new Map();
const rawDocs = [];

if (fs.existsSync(changesDirPath)) {
  try {
    const files = fs.readdirSync(changesDirPath).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(changesDirPath, file), 'utf8'));
        const rawSlug = doc.id || doc.slug || file.replace('.json', '');
        rawDocs.push({ rawSlug, doc });
      } catch (err) {
        console.warn(`Failed to parse ${file} for sitemap serialization:`, err.message);
      }
    }
  } catch (err) {
    console.warn('Failed to scan data/changes for sitemap serialization:', err.message);
  }
} else if (fs.existsSync(indexFilePath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
    for (const item of raw) {
      if (item.id || item.slug) {
        rawDocs.push({ rawSlug: item.id || item.slug, doc: item });
      }
    }
  } catch (err) {
    console.warn('Failed to load data/index.json for sitemap serialization:', err.message);
  }
}

function getApiBaseAndVersion(api) {
  const raw = (api || '').trim();
  const lastDot = raw.lastIndexOf('.');
  if (lastDot === -1) return { baseApi: raw, version: 'v1' };
  const prefix = raw.slice(0, lastDot);
  const suffix = raw.slice(lastDot + 1);
  const subMatch = suffix.match(/^(.+)_(v\d+[a-z0-9]*)$/i);
  if (subMatch) return { baseApi: `${prefix}.${subMatch[1]}`, version: subMatch[2] };
  return { baseApi: prefix, version: suffix };
}

function getVersionlessChangeSlug(rawSlug, api, date) {
  const { baseApi, version } = getApiBaseAndVersion(api);
  if (version) {
    const escapedVer = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripped = rawSlug.replace(new RegExp(`[-_]${escapedVer}(?=-\\d+$|$)`, 'i'), '');
    if (stripped && stripped !== rawSlug) return stripped;
  }
  const cleanBase = baseApi.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${date}-${cleanBase}`;
}

function getVersionStabilityRank(version) {
  const v = (version || '').toLowerCase();
  if (/^v\d+$/.test(v)) return 0;
  if (/^v\d+(p\d+|b\d+)$/.test(v)) return 1;
  if (v.includes('beta')) return 2;
  if (v.includes('alpha')) return 3;
  return 4;
}

const siblingGroups = new Map();
for (const item of rawDocs) {
  const dateStr = String(item.doc.date || item.rawSlug.slice(0, 10)).slice(0, 10);
  const versionlessSlug = getVersionlessChangeSlug(item.rawSlug, item.doc.api || '', dateStr);
  if (!siblingGroups.has(versionlessSlug)) siblingGroups.set(versionlessSlug, []);
  siblingGroups.get(versionlessSlug).push(item);
}
for (const [versionlessSlug, members] of siblingGroups.entries()) {
  members.sort((a, b) => {
    const rankDiff =
      getVersionStabilityRank(getApiBaseAndVersion(a.doc.api).version) -
      getVersionStabilityRank(getApiBaseAndVersion(b.doc.api).version);
    if (rankDiff !== 0) return rankDiff;
    const breakingDiff = (b.doc.breaking ? 1 : 0) - (a.doc.breaking ? 1 : 0);
    if (breakingDiff !== 0) return breakingDiff;
    const scoreDiff = (b.doc.interesting_score ?? 0) - (a.doc.interesting_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.rawSlug.localeCompare(b.rawSlug);
  });
  const primary = members[0];
  changeMap.set(versionlessSlug, {
    ...primary.doc,
    breaking: members.some((m) => Boolean(m.doc.breaking || m.doc.is_breaking)),
    interesting_score: Math.max(...members.map((m) => Number(m.doc.interesting_score ?? 5))),
    details: members.map((m) => `${m.doc.summary || ''} ${m.doc.details || ''}`.trim()).join(' '),
  });
}

function isIndexableChangeDoc(doc) {
  if (!doc) return true;
  const proseLen = `${doc.summary || ''} ${doc.details || ''}`.trim().length;
  return Boolean(doc.breaking || (Number(doc.interesting_score ?? 5) >= 6 && proseLen >= 500));
}

// https://astro.build/config
export default defineConfig({
  site: 'https://google-cloud-radar.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => {
        if (page.includes('/breaking') || page.includes('/404')) return false;
        const changeMatch = page.match(/\/changes\/([^/]+)/);
        if (changeMatch) {
          const slug = changeMatch[1];
          const doc = changeMap.get(slug);
          if (doc && !isIndexableChangeDoc(doc)) return false;
        }
        return true;
      },
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
