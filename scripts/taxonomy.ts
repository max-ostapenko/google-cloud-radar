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
  id?: string;
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
    id: svcId,
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

export function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isChangeWatchedBySubscriber(
  subscriber: {
    all_services?: boolean;
    allServices?: boolean;
    watched_services?: string[];
    watchedServices?: string[];
  },
  change: Record<string, any>
): boolean {
  const allServices = subscriber.all_services ?? subscriber.allServices ?? true;
  if (allServices) {
    return true;
  }

  const rawWatched = subscriber.watched_services ?? subscriber.watchedServices ?? [];
  if (!Array.isArray(rawWatched) || rawWatched.length === 0) {
    return false;
  }

  const changeApi = (change.api || '').toLowerCase().trim();
  const changeApiPrefix = changeApi.split('.')[0].split(':')[0];
  const changeService = (change.service || change.service_name || '').toLowerCase().trim();
  const changeServiceSlug = slugify(changeService);

  const changeMeta =
    findServiceMeta(changeApi) ||
    (changeApiPrefix ? findServiceMeta(changeApiPrefix) : null) ||
    (changeService ? findServiceMeta(changeService) : null);

  const canonicalId = (changeMeta?.id || '').toLowerCase();
  const canonicalName = (changeMeta?.name || '').toLowerCase();
  const canonicalSlug = canonicalName ? slugify(canonicalName) : '';
  const canonicalAliases = (changeMeta?.aliases || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
  const canonicalAliasSlugs = canonicalAliases.map((a) => slugify(a));

  for (const item of rawWatched) {
    if (!item || typeof item !== 'string') continue;
    const w = item.toLowerCase().trim();
    const wSlug = slugify(w);

    // 1. Direct API match (e.g. subscriber watches "bigquery.v2" or "bigquery")
    if (changeApi && (w === changeApi || wSlug === changeApi.replace(/[^a-z0-9]+/g, '-'))) {
      return true;
    }
    if (changeApiPrefix && (w === changeApiPrefix || wSlug === changeApiPrefix)) {
      return true;
    }

    // 2. Direct service string / slug match
    if (changeService && (w === changeService || wSlug === changeServiceSlug)) {
      return true;
    }

    // 3. Match against canonical metadata (id, name, slug, aliases)
    if (canonicalId && (w === canonicalId || wSlug === canonicalId)) {
      return true;
    }
    if (canonicalName && (w === canonicalName || wSlug === canonicalSlug)) {
      return true;
    }
    if (canonicalAliases.includes(w) || canonicalAliasSlugs.includes(wSlug)) {
      return true;
    }

    // 4. Resolve watched item in taxonomy
    const wMeta = findServiceMeta(w);
    if (wMeta) {
      if (changeMeta && wMeta.id && changeMeta.id && wMeta.id === changeMeta.id) {
        return true;
      }
      if (changeApiPrefix && wMeta.id && wMeta.id.toLowerCase() === changeApiPrefix) {
        return true;
      }
    }

    // 5. Loose substring matching if token is distinct (length >= 3)
    if (wSlug && wSlug.length >= 3) {
      if (changeServiceSlug && (changeServiceSlug.includes(wSlug) || wSlug.includes(changeServiceSlug))) {
        return true;
      }
      if (canonicalSlug && (canonicalSlug.includes(wSlug) || wSlug.includes(canonicalSlug))) {
        return true;
      }
    }
  }

  return false;
}

