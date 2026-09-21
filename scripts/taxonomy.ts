/**
 * Taxonomy and Watchlist Configuration for Google Cloud Radar.
 *
 * Hierarchical 3-level taxonomy:
 * 1. Ecosystems: List of ecosystems with categories ID list
 * 2. Categories: List of categories with services ID list
 * 3. Services: Dictionary of services with canonical names, aliases, and release feeds
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServiceMeta {
  name: string;
  ecosystem: string;
  ecosystem_id: string;
  category?: string;
  category_id?: string;
  aliases?: string[];
  release_feed_url?: string;
  release_feed_urls?: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAXONOMY_PATH = path.resolve(__dirname, '../data/taxonomy.json');

const taxonomyRaw = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf-8'));

const _ECOSYSTEMS_RAW: Array<{ id: string; name: string; categories?: string[]; services?: string[] }> = taxonomyRaw.ecosystems || [];
const _CATEGORIES_RAW: Array<{ id: string; name: string; services?: string[] }> = taxonomyRaw.categories || [];
const _SERVICES_RAW: Record<string, any> = taxonomyRaw.services || {};

export const ECOSYSTEMS_BY_ID: Record<string, any> = Object.fromEntries(_ECOSYSTEMS_RAW.map((e) => [e.id, e]));
export const CATEGORIES_BY_ID: Record<string, any> = Object.fromEntries(_CATEGORIES_RAW.map((c) => [c.id, c]));

// Parent mappings
const CATEGORY_TO_ECOSYSTEM: Record<string, any> = {};
for (const eco of _ECOSYSTEMS_RAW) {
  for (const catId of eco.categories || []) {
    CATEGORY_TO_ECOSYSTEM[catId] = eco;
  }
}

const SERVICE_TO_CATEGORY: Record<string, any> = {};
for (const cat of _CATEGORIES_RAW) {
  for (const svcId of cat.services || []) {
    SERVICE_TO_CATEGORY[svcId] = cat;
  }
}

const SERVICE_TO_ECOSYSTEM: Record<string, any> = {};
for (const eco of _ECOSYSTEMS_RAW) {
  for (const svcId of eco.services || []) {
    SERVICE_TO_ECOSYSTEM[svcId] = eco;
  }
}

// Resolved ServiceMeta for all services
export const WATCHED_SERVICES: Record<string, ServiceMeta> = {};
for (const [svcId, svcData] of Object.entries(_SERVICES_RAW)) {
  const cat = SERVICE_TO_CATEGORY[svcId];
  let eco: any = {};
  let categoryName = '';
  let categoryId = '';

  if (cat) {
    eco = CATEGORY_TO_ECOSYSTEM[cat.id] || {};
    categoryName = cat.name || '';
    categoryId = cat.id || '';
  } else {
    eco = SERVICE_TO_ECOSYSTEM[svcId] || {};
  }

  const meta: ServiceMeta = {
    name: svcData.name || svcId,
    ecosystem: eco.name || 'More',
    ecosystem_id: eco.id || 'more',
    aliases: svcData.aliases || [],
    release_feed_url: svcData.release_feed_url,
    release_feed_urls: svcData.release_feed_urls || [],
  };

  if (categoryName) {
    meta.category = categoryName;
    meta.category_id = categoryId;
  }

  WATCHED_SERVICES[svcId] = meta;
}

export const ECOSYSTEMS: string[] = _ECOSYSTEMS_RAW.map((e) => e.name);
export const CATEGORIES: string[] = _CATEGORIES_RAW.map((c) => c.name);

export function getEcosystems(): any[] {
  return _ECOSYSTEMS_RAW;
}

export function getCategories(): any[] {
  return _CATEGORIES_RAW;
}

export function getServices(): Record<string, any> {
  return _SERVICES_RAW;
}

export function findServiceMeta(serviceOrApi: string): ServiceMeta | null {
  if (!serviceOrApi) return null;
  const lower = serviceOrApi.toLowerCase().trim();
  if (WATCHED_SERVICES[lower]) {
    return WATCHED_SERVICES[lower];
  }

  // Check API prefix (e.g. "aiplatform.v1" -> "aiplatform", "discoveryengine:v1" -> "discoveryengine")
  const prefix = lower.split('.')[0].split(':')[0];
  if (WATCHED_SERVICES[prefix]) {
    return WATCHED_SERVICES[prefix];
  }

  const clean = lower.replace(/[^a-z0-9]/g, '');
  if (WATCHED_SERVICES[clean]) {
    return WATCHED_SERVICES[clean];
  }

  const cleanPrefix = prefix.replace(/[^a-z0-9]/g, '');
  if (WATCHED_SERVICES[cleanPrefix]) {
    return WATCHED_SERVICES[cleanPrefix];
  }

  // Exact or alias/name matches
  for (const meta of Object.values(WATCHED_SERVICES)) {
    const name = (meta.name || '').toLowerCase();
    const aliases = (meta.aliases || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
    for (const candidate of [name, ...aliases]) {
      if (!candidate) continue;
      if (candidate === lower) return meta;
      const cleanCand = candidate.replace(/[^a-z0-9]/g, '');
      if (clean && clean === cleanCand) return meta;
    }
  }

  // Check if a full canonical name or alias is contained in the query string
  for (const meta of Object.values(WATCHED_SERVICES)) {
    const name = (meta.name || '').toLowerCase();
    const aliases = (meta.aliases || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
    for (const candidate of [name, ...aliases]) {
      if (candidate && candidate.length >= 4 && lower.includes(candidate)) {
        return meta;
      }
    }
  }

  return null;
}

export function isWatchedApi(apiName: string): boolean {
  return findServiceMeta(apiName) !== null;
}

export function getWatchedApiNames(): string[] {
  return Object.keys(WATCHED_SERVICES).sort();
}

export function getEcosystemForService(serviceOrApi: string): string {
  const meta = findServiceMeta(serviceOrApi);
  return meta?.ecosystem || 'More';
}

export function getCategoryForService(serviceOrApi: string): string | null {
  const meta = findServiceMeta(serviceOrApi);
  return meta?.category || null;
}

export function getReleaseFeedUrls(serviceOrApi: string): string[] {
  const meta = findServiceMeta(serviceOrApi);
  if (!meta) return [];

  const urls: string[] = [];
  if (Array.isArray(meta.release_feed_urls)) {
    for (const u of meta.release_feed_urls) {
      if (u && !urls.includes(u)) {
        urls.push(u);
      }
    }
  }
  if (meta.release_feed_url && !urls.includes(meta.release_feed_url)) {
    urls.push(meta.release_feed_url);
  }
  return urls;
}

export function getReleaseFeedUrl(serviceOrApi: string): string | null {
  const urls = getReleaseFeedUrls(serviceOrApi);
  return urls.length > 0 ? urls[0] : null;
}

export function getOfficialReleaseFeeds(): Record<string, string> {
  const feeds: Record<string, string> = {};
  for (const key of Object.keys(WATCHED_SERVICES)) {
    const urls = getReleaseFeedUrls(key);
    if (urls.length > 0) {
      feeds[key] = urls[0];
    }
  }
  return feeds;
}
