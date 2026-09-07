import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import taxonomyData from '../../../data/taxonomy.json';

// Secure Marked instance that neutralizes embedded raw HTML while rendering valid Markdown
const safeMarkdownParser = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(token: any) {
      const text = typeof token === 'string' ? token : (token?.text || '');
      return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },
  },
});

export type ChangeStatus = 'canary' | 'released' | 'retracted' | 'deprecated';
export type RadarRing = 'assess' | 'trial' | 'adopt' | 'hold';
export type RadarQuadrant = 'ai_ml' | 'data_platforms' | 'infra_compute' | 'security_finops';

export interface ReactionCounts {
  like_change: number;
  released: number;
  false_positive_or_duplicate: number;
}

export interface FeedEntryMeta {
  slug: string;
  date: string;
  api: string;
  service: string;
  service_id?: string;
  version?: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  breaking: boolean;
  tags: string[];
  interesting_score: number;
  generated_at?: string;
  status?: ChangeStatus;
  radar_ring?: RadarRing;
  radar_quadrant?: RadarQuadrant;
  radar_movement?: 'new' | 'promoted' | 'demoted' | 'unchanged';
  lead_time_days?: number;
  official_release_date?: string;
  official_release_notes_url?: string;
  reaction_counts?: ReactionCounts;
  comments_count?: number;
  discoveryRestUrl?: string;
  documentationLink?: string;
  stats?: {
    upvotes?: number;
    impacted_users_count?: number;
    comments_count?: number;
  };
}

export const ECOSYSTEMS = taxonomyData.ecosystems;
export type Ecosystem =
  | 'Google Cloud'
  | 'Workspace'
  | 'Marketing Platform'
  | 'Personal'
  | 'Chrome'
  | 'Android'
  | 'More';

export const CATEGORIES = taxonomyData.categories;
export type ServiceCategory =
  | 'AI & ML'
  | 'Data Analytics'
  | 'Application Development'
  | 'FinOps & Billing'
  | 'Security'
  | 'Workspace'
  | 'Marketing Platform'
  | 'Chrome & Web'
  | 'Personal'
  | 'Android'
  | 'More'
  | string;

export interface WatchedServiceConfig {
  ecosystem: Ecosystem;
  category: ServiceCategory;
  quadrant?: string;
  name: string;
  release_feed_url?: string;
  release_feed_urls?: string[];
}

const watchedServices = taxonomyData.watched_services as Record<string, WatchedServiceConfig>;

const SERVICE_META_MAP: Record<string, { ecosystem: Ecosystem; category: ServiceCategory; name: string }> = {};

for (const [key, meta] of Object.entries(watchedServices)) {
  const itemMeta = {
    ecosystem: meta.ecosystem,
    category: meta.category,
    name: meta.name || key,
  };
  SERVICE_META_MAP[key.toLowerCase()] = itemMeta;
  const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanKey) SERVICE_META_MAP[cleanKey] = itemMeta;

  if (meta.name) {
    SERVICE_META_MAP[meta.name.toLowerCase()] = itemMeta;
    const cleanName = meta.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanName) SERVICE_META_MAP[cleanName] = itemMeta;
  }
}

export function findServiceMeta(serviceOrApi: string): { ecosystem: Ecosystem; category: ServiceCategory; name: string } | null {
  if (!serviceOrApi) return null;
  const lower = serviceOrApi.toLowerCase().trim();
  if (SERVICE_META_MAP[lower]) return SERVICE_META_MAP[lower];

  const clean = lower.replace(/[^a-z0-9]/g, '');
  if (clean && SERVICE_META_MAP[clean]) return SERVICE_META_MAP[clean];

  for (const [key, meta] of Object.entries(SERVICE_META_MAP)) {
    if (lower.includes(key)) {
      return meta;
    }
    const cleanKey = key.replace(/[^a-z0-9]/g, '');
    if (clean && cleanKey && cleanKey.length >= 4 && clean.includes(cleanKey)) {
      return meta;
    }
  }
  return null;
}

export function getEcosystemForService(serviceOrApi: string): Ecosystem {
  const meta = findServiceMeta(serviceOrApi);
  return meta?.ecosystem || 'Google Cloud';
}

export function getCategoryForService(serviceOrApi: string): ServiceCategory {
  const meta = findServiceMeta(serviceOrApi);
  return meta?.category || 'Data Analytics';
}

export interface DiscoveryDirectoryItem {
  id: string;
  name: string;
  version: string;
  title?: string;
  description?: string;
  discoveryRestUrl: string;
  documentationLink?: string;
  preferred?: boolean;
}

let discoveryDirectoryMap: Map<string, DiscoveryDirectoryItem> | null = null;

export function getDiscoveryDirectoryMap(): Map<string, DiscoveryDirectoryItem> {
  if (discoveryDirectoryMap) {
    return discoveryDirectoryMap;
  }

  discoveryDirectoryMap = new Map<string, DiscoveryDirectoryItem>();

  const candidates = [
    path.resolve(process.cwd(), '../discoveries/index.json'),
    path.resolve(process.cwd(), 'discoveries/index.json'),
    path.resolve(process.cwd(), '../../discoveries/index.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const fileContent = fs.readFileSync(p, 'utf-8');
        const json = JSON.parse(fileContent);
        if (json && Array.isArray(json.items)) {
          for (const item of json.items) {
            const rawId = (item.id || '').toLowerCase();
            const name = (item.name || '').toLowerCase();
            const version = (item.version || '').toLowerCase();
            const dotId = `${name}.${version}`;

            if (rawId) discoveryDirectoryMap.set(rawId, item);
            if (dotId) discoveryDirectoryMap.set(dotId, item);

            if (item.preferred || !discoveryDirectoryMap.has(name)) {
              discoveryDirectoryMap.set(name, item);
            }
          }
        }
        break;
      } catch (e) {
        console.error('Error loading discoveries/index.json:', e);
      }
    }
  }

  return discoveryDirectoryMap;
}

export function getDiscoveryMetaForApi(apiOrService: string): { discoveryRestUrl?: string; documentationLink?: string } {
  const map = getDiscoveryDirectoryMap();
  const normalized = (apiOrService || '').trim().toLowerCase();

  let item = map.get(normalized);
  if (!item && normalized.includes('.')) {
    item = map.get(normalized.replace('.', ':'));
  }
  if (!item && normalized.includes(':')) {
    item = map.get(normalized.replace(':', '.'));
  }
  if (!item && normalized.includes('.')) {
    item = map.get(normalized.split('.')[0]);
  }
  if (!item && normalized.includes('-')) {
    item = map.get(normalized.replace(/-/g, ''));
  }

  if (item) {
    return {
      discoveryRestUrl: item.discoveryRestUrl,
      documentationLink: item.documentationLink,
    };
  }

  if (normalized.includes('.')) {
    const [name, ver] = normalized.split('.');
    return {
      discoveryRestUrl: `https://${name}.googleapis.com/$discovery/rest?version=${ver || 'v1'}`,
    };
  }

  return {};
}

export interface FeedEntry extends FeedEntryMeta {
  status: ChangeStatus;
  radar_ring: RadarRing;
  radar_quadrant: RadarQuadrant;
  reaction_counts: ReactionCounts;
  comments_count: number;
  rawContent: string;
  htmlContent: string;
  summary: string;
  detailsHtml: string;
  extractedMethods: string[];
  ecosystem: Ecosystem;
  category: ServiceCategory;
}

const DB_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT_ID = process.env.GCP_PROJECT || 'gcp-cloud-radar';

/**
 * Live Mock Firestore / Emulator REST Fetch
 */
export async function fetchFromFirestore(): Promise<FeedEntry[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    const res = await fetch(
      `http://${DB_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/changes`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    if (!json.documents || !Array.isArray(json.documents)) return null;

    return json.documents.map((doc: any) => {
      const f = doc.fields || {};
      const id = f.id?.stringValue || f.slug?.stringValue || '';
      const service = f.service_name?.stringValue || f.service?.stringValue || 'Google Cloud';
      const service_id = f.service_id?.stringValue || slugify(service);
      const api = f.api?.stringValue || '';
      const version = f.version?.stringValue || (api.includes('.') ? api.split('.').pop() : 'v1');
      const rawDate = f.first_detected_at?.timestampValue || f.first_detected_at?.stringValue || f.date?.stringValue || id.slice(0, 10);
      const dateStr = rawDate.slice(0, 10);
      const title = f.title?.stringValue || `${service} Update`;
      const summary = f.summary?.stringValue || '';
      const detailsMarkdown = f.details_markdown?.stringValue || summary;
      const impact = (f.impact?.stringValue || 'medium').toLowerCase() as 'low' | 'medium' | 'high';
      const breaking = Boolean(f.is_breaking?.booleanValue ?? f.breaking?.booleanValue);
      const interesting_score = parseInt(f.interesting_score?.integerValue || '5', 10);
      const status = (f.status?.stringValue || 'canary') as ChangeStatus;
      const lead_time_days = f.lead_time_days ? parseInt(f.lead_time_days.integerValue, 10) : undefined;
      const official_release_date = f.official_release_date?.timestampValue || f.official_release_date?.stringValue;
      const official_release_notes_url = f.official_release_notes_url?.stringValue;

      const radar_ring = (f.radar_ring?.stringValue || (breaking ? 'hold' : status === 'released' ? 'adopt' : 'assess')) as RadarRing;
      const radar_quadrant = (f.radar_quadrant?.stringValue || 'infra_compute') as RadarQuadrant;
      const radar_movement = (f.radar_movement?.stringValue || 'new') as 'new' | 'promoted' | 'demoted' | 'unchanged';

      let reaction_counts: ReactionCounts = { like_change: 0, released: 0, false_positive_or_duplicate: 0 };
      if (f.reaction_counts?.mapValue?.fields) {
        const rc = f.reaction_counts.mapValue.fields;
        reaction_counts = {
          like_change: parseInt(rc.like_change?.integerValue || '0', 10),
          released: parseInt(rc.released?.integerValue || '0', 10),
          false_positive_or_duplicate: parseInt(rc.false_positive_or_duplicate?.integerValue || '0', 10),
        };
      }
      const comments_count = parseInt(f.comments_count?.integerValue || '0', 10);

      let tags: string[] = [];
      if (f.tags?.arrayValue?.values) {
        tags = f.tags.arrayValue.values.map((v: any) => v.stringValue).filter(Boolean);
      }

      let extractedMethods: string[] = [];
      if (f.extracted_methods?.arrayValue?.values) {
        extractedMethods = f.extracted_methods.arrayValue.values.map((v: any) => v.stringValue).filter(Boolean);
      }

      let stats = undefined;
      if (f.stats?.stringValue) {
        try {
          stats = JSON.parse(f.stats.stringValue);
        } catch {}
      }

      const htmlContent = safeMarkdownParser.parse(detailsMarkdown || summary, { async: false }) as string;
      const ecosystem = (f.ecosystem?.stringValue as Ecosystem) || getEcosystemForService(service || api);
      const category = (f.category?.stringValue as ServiceCategory) || getCategoryForService(service || api);

      const discoMeta = getDiscoveryMetaForApi(api || service);
      const discoveryRestUrl = f.discovery_rest_url?.stringValue || discoMeta.discoveryRestUrl;
      const documentationLink = f.documentation_link?.stringValue || discoMeta.documentationLink;

      return {
        slug: id,
        date: dateStr,
        api,
        version,
        service,
        service_id,
        title,
        impact,
        breaking,
        tags,
        interesting_score,
        status,
        radar_ring,
        radar_quadrant,
        radar_movement,
        lead_time_days,
        official_release_date,
        official_release_notes_url,
        reaction_counts,
        comments_count,
        stats,
        discoveryRestUrl,
        documentationLink,
        rawContent: detailsMarkdown,
        htmlContent,
        summary,
        detailsHtml: htmlContent,
        extractedMethods,
        ecosystem,
        category,
      };
    });
  } catch (err) {
    return null;
  }
}

export function getDataChangesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../data/changes'),
    path.resolve(process.cwd(), 'data/changes'),
    path.resolve(process.cwd(), '../../data/changes'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function getLocalFeedEntries(): FeedEntry[] {
  const changesDir = getDataChangesDir();
  if (!fs.existsSync(changesDir)) {
    return [];
  }

  const files = fs.readdirSync(changesDir).filter((file) => file.endsWith('.json'));
  const entries: FeedEntry[] = [];

  for (const file of files) {
    const filePath = path.join(changesDir, file);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const doc = JSON.parse(fileContent);

      const slug = doc.slug || doc.id || file.replace(/\.json$/, '');
      const service = doc.service || doc.service_name || doc.api || 'Google Cloud';
      const service_id = slugify(service);
      const api = doc.api || slug.split('-').slice(3).join('-').replace(/_v\d+$/, '');
      const version = api.split('.').pop() || 'v1';
      const dateStr = String(doc.date || slug.slice(0, 10)).slice(0, 10);
      const impact = (doc.impact || 'medium').toLowerCase() as 'low' | 'medium' | 'high';
      const breaking = Boolean(doc.breaking || doc.is_breaking);
      const tags = Array.isArray(doc.tags) ? doc.tags : [];
      const interesting_score = Number(doc.interesting_score ?? 5);
      const summary = doc.summary || '';
      const details = doc.details || summary;
      const extractedMethods = Array.isArray(doc.extracted_methods) ? doc.extracted_methods : [];

      const htmlContent = safeMarkdownParser.parse(details || summary, { async: false }) as string;
      const ecosystem = (doc.ecosystem as Ecosystem) || getEcosystemForService(service || api);
      const category = (doc.category as ServiceCategory) || getCategoryForService(service || api);
      const status = (doc.status || 'canary').toLowerCase() as ChangeStatus;
      const radar_ring = (doc.radar_ring || (breaking ? 'hold' : status === 'released' ? 'adopt' : 'assess')) as RadarRing;
      const radar_quadrant: RadarQuadrant = category.includes('AI') ? 'ai_ml' : category.includes('FinOps') ? 'security_finops' : 'data_platforms';
      const lead_time_days = doc.lead_time_days ? Number(doc.lead_time_days) : undefined;
      const official_release_date = doc.official_release_date ? String(doc.official_release_date) : undefined;
      const official_release_notes_url = doc.official_release_notes_url ? String(doc.official_release_notes_url) : undefined;
      const stats = doc.stats || undefined;

      const discoMeta = getDiscoveryMetaForApi(api || service);
      const discoveryRestUrl = doc.discovery_rest_url || discoMeta.discoveryRestUrl;
      const documentationLink = doc.documentation_link || discoMeta.documentationLink;

      entries.push({
        slug,
        date: dateStr,
        api,
        version,
        service,
        service_id,
        title: doc.title || `${service} API Update`,
        impact,
        breaking,
        tags,
        interesting_score,
        status,
        radar_ring,
        radar_quadrant,
        radar_movement: 'new',
        lead_time_days,
        official_release_date,
        official_release_notes_url,
        reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
        comments_count: 0,
        stats,
        discoveryRestUrl,
        documentationLink,
        rawContent: details,
        htmlContent,
        summary,
        detailsHtml: htmlContent,
        extractedMethods,
        ecosystem,
        category,
      });
    } catch (err) {
      console.error(`Error parsing change JSON ${file}:`, err);
    }
  }

  return entries.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.slug.localeCompare(a.slug);
  });
}

export async function getAllFeedEntries(): Promise<FeedEntry[]> {
  const localEntries = getLocalFeedEntries();
  if (localEntries && localEntries.length > 0) {
    return localEntries;
  }
  const dbEntries = await fetchFromFirestore();
  if (dbEntries && dbEntries.length > 0) {
    return dbEntries.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.slug.localeCompare(a.slug);
    });
  }
  return [];
}

export async function getActiveDataSource(): Promise<{ type: 'database' | 'filesystem'; label: string }> {
  const dbEntries = await fetchFromFirestore();
  if (dbEntries && dbEntries.length > 0) {
    return { type: 'database', label: `Connected to Mock Firestore (localhost:${DB_HOST.split(':')[1] || '8080'})` };
  }
  return { type: 'filesystem', label: 'Local Filesystem (data/changes/*.json)' };
}

export async function getFeedEntryBySlug(slug: string): Promise<FeedEntry | undefined> {
  const entries = await getAllFeedEntries();
  return entries.find((e) => e.slug === slug);
}

export interface ServiceInfo {
  service: string;
  slug: string;
  count: number;
  breakingCount: number;
  ecosystem: Ecosystem;
  category: ServiceCategory;
}

const seenServiceNames = new Set<string>();
export const MONITORED_SERVICES_LIST: { name: string; ecosystem: Ecosystem; category: ServiceCategory }[] = [];

for (const meta of Object.values(watchedServices)) {
  if (meta.name && !seenServiceNames.has(meta.name)) {
    seenServiceNames.add(meta.name);
    MONITORED_SERVICES_LIST.push({
      name: meta.name,
      ecosystem: meta.ecosystem,
      category: meta.category,
    });
  }
}

export async function getServicesList(): Promise<ServiceInfo[]> {
  const entries = await getAllFeedEntries();
  const map = new Map<string, { service: string; count: number; breakingCount: number; ecosystem: Ecosystem; category: ServiceCategory }>();

  for (const item of MONITORED_SERVICES_LIST) {
    const slug = slugify(item.name);
    map.set(slug, {
      service: item.name,
      count: 0,
      breakingCount: 0,
      ecosystem: item.ecosystem,
      category: item.category,
    });
  }

  for (const entry of entries) {
    const slug = slugify(entry.service);
    const existing = map.get(slug) || {
      service: entry.service,
      count: 0,
      breakingCount: 0,
      ecosystem: entry.ecosystem || getEcosystemForService(entry.service),
      category: entry.category || getCategoryForService(entry.service),
    };
    existing.count += 1;
    if (entry.breaking) {
      existing.breakingCount += 1;
    }
    map.set(slug, existing);
  }

  return Array.from(map.entries())
    .map(([slug, data]) => ({
      service: data.service,
      slug,
      count: data.count,
      breakingCount: data.breakingCount,
      ecosystem: data.ecosystem,
      category: data.category,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.service.localeCompare(b.service);
    });
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export interface MonthGroup {
  key: string; // e.g. "2026-08"
  label: string; // e.g. "August 2026"
  year: number; // 2026
  monthName: string; // "August"
  totalCount: number;
  breakingCount: number;
  highImpactCount: number;
  entries: FeedEntry[];
}

export function groupEntriesByMonth(entries: FeedEntry[]): MonthGroup[] {
  const monthMap = new Map<string, FeedEntry[]>();

  for (const entry of entries) {
    if (!entry.date) continue;
    const monthKey = entry.date.slice(0, 7); // "YYYY-MM"
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, []);
    }
    monthMap.get(monthKey)!.push(entry);
  }

  const sortedMonthKeys = Array.from(monthMap.keys()).sort().reverse();

  return sortedMonthKeys.map((key) => {
    const monthEntries = monthMap.get(key)!;
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const dateObj = new Date(Date.UTC(year, monthIndex, 1));
    const label = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const monthName = dateObj.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

    return {
      key,
      label,
      year,
      monthName,
      totalCount: monthEntries.length,
      breakingCount: monthEntries.filter((e) => e.breaking).length,
      highImpactCount: monthEntries.filter((e) => e.impact === 'high').length,
      entries: monthEntries,
    };
  });
}
