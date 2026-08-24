import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export type ChangeStatus = 'canary' | 'released' | 'retracted' | 'deprecated';
export type RadarRing = 'assess' | 'trial' | 'adopt' | 'hold';
export type RadarQuadrant = 'ai_ml' | 'data_platforms' | 'infra_compute' | 'security_finops';

export interface ReactionCounts {
  impacts_prod: number;
  breaking_me: number;
  watch_ga: number;
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
  stats?: {
    upvotes?: number;
    impacted_users_count?: number;
    comments_count?: number;
  };
}

export type Ecosystem =
  | 'Google Cloud'
  | 'Workspace'
  | 'Marketing Platform'
  | 'Personal'
  | 'Chrome'
  | 'Android'
  | 'More';

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
  | 'More';

const SERVICE_META_MAP: Record<string, { ecosystem: Ecosystem; category: ServiceCategory }> = {
  // Google Cloud
  aiplatform: { ecosystem: 'Google Cloud', category: 'AI & ML' },
  'Vertex AI': { ecosystem: 'Google Cloud', category: 'AI & ML' },
  bigquery: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigQuery': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  biglake: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigLake': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  bigqueryconnection: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigQuery Connection': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  bigquerydatapolicy: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigQuery Data Policy': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  bigquerydatatransfer: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigQuery Data Transfer': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  bigqueryreservation: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'BigQuery Reservation': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  datacatalog: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Data Catalog': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  dataform: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Dataform': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  datalineage: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Data Lineage': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  dataplex: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Dataplex': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  datapipelines: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Data Pipelines': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  analyticshub: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Analytics Hub': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  looker: { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  'Looker Core': { ecosystem: 'Google Cloud', category: 'Data Analytics' },
  connectors: { ecosystem: 'Google Cloud', category: 'Application Development' },
  'Integration Connectors': { ecosystem: 'Google Cloud', category: 'Application Development' },
  integrations: { ecosystem: 'Google Cloud', category: 'Application Development' },
  'Application Integration': { ecosystem: 'Google Cloud', category: 'Application Development' },
  cloudbilling: { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },
  'Cloud Billing': { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },
  billingbudgets: { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },
  'Cloud Billing Budgets': { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },
  appoptimize: { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },
  'App Optimize': { ecosystem: 'Google Cloud', category: 'FinOps & Billing' },

  // Workspace
  script: { ecosystem: 'Workspace', category: 'Workspace' },
  'Apps Script': { ecosystem: 'Workspace', category: 'Workspace' },
  admin: { ecosystem: 'Workspace', category: 'Workspace' },
  gmail: { ecosystem: 'Workspace', category: 'Workspace' },
  drive: { ecosystem: 'Workspace', category: 'Workspace' },

  // Marketing Platform
  tagmanager: { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  'Tag Manager': { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  searchconsole: { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  'Search Console': { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  pagespeedonline: { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  'PageSpeed Insights': { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  chromeuxreport: { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },
  'Chrome UX Report': { ecosystem: 'Marketing Platform', category: 'Marketing Platform' },

  // Personal
  photoslibrary: { ecosystem: 'Personal', category: 'Personal' },
  youtube: { ecosystem: 'Personal', category: 'Personal' },

  // Chrome
  abusiveexperiencereport: { ecosystem: 'Chrome', category: 'Chrome & Web' },
  adexperiencereport: { ecosystem: 'Chrome', category: 'Chrome & Web' },
  versionhistory: { ecosystem: 'Chrome', category: 'Chrome & Web' },

  // Android
  androidpublisher: { ecosystem: 'Android', category: 'Android' },

  // More
  discovery: { ecosystem: 'More', category: 'More' },
  'Discovery Service': { ecosystem: 'More', category: 'More' },
  safebrowsing: { ecosystem: 'More', category: 'Security' },
  webrisk: { ecosystem: 'More', category: 'Security' },
  libraryagent: { ecosystem: 'More', category: 'More' },
  'Library Agent': { ecosystem: 'More', category: 'More' },
};

export function getEcosystemForService(serviceOrApi: string): Ecosystem {
  for (const [key, meta] of Object.entries(SERVICE_META_MAP)) {
    if (serviceOrApi.toLowerCase().includes(key.toLowerCase())) {
      return meta.ecosystem;
    }
  }
  return 'Google Cloud';
}

export function getCategoryForService(serviceOrApi: string): ServiceCategory {
  for (const [key, meta] of Object.entries(SERVICE_META_MAP)) {
    if (serviceOrApi.toLowerCase().includes(key.toLowerCase())) {
      return meta.category;
    }
  }
  return 'Data Analytics';
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
const PROJECT_ID = process.env.GCP_PROJECT || 'max-ostapenko';

/**
 * Attempt to fetch changes live from Firestore / Mock REST Server
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
      const service_id = f.service_id?.stringValue || id.toLowerCase();
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

      let reaction_counts: ReactionCounts = { impacts_prod: 0, breaking_me: 0, watch_ga: 0 };
      if (f.reaction_counts?.mapValue?.fields) {
        const rc = f.reaction_counts.mapValue.fields;
        reaction_counts = {
          impacts_prod: parseInt(rc.impacts_prod?.integerValue || '0', 10),
          breaking_me: parseInt(rc.breaking_me?.integerValue || '0', 10),
          watch_ga: parseInt(rc.watch_ga?.integerValue || '0', 10),
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

      const htmlContent = marked.parse(detailsMarkdown, { async: false }) as string;
      const ecosystem = (f.ecosystem?.stringValue as Ecosystem) || getEcosystemForService(service || api);
      const category = (f.category?.stringValue as ServiceCategory) || getCategoryForService(service || api);

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

export function getFeedDir(): string {
  const rootFeed = path.resolve(process.cwd(), '../feed');
  if (fs.existsSync(rootFeed)) {
    return rootFeed;
  }
  const localFeed = path.resolve(process.cwd(), 'feed');
  if (fs.existsSync(localFeed)) {
    return localFeed;
  }
  return rootFeed;
}

export function getLocalFeedEntries(): FeedEntry[] {
  const feedDir = getFeedDir();
  if (!fs.existsSync(feedDir)) {
    return [];
  }

  const files = fs.readdirSync(feedDir).filter((file) => file.endsWith('.md') && file !== 'README.md');
  const entries: FeedEntry[] = [];

  for (const file of files) {
    const filePath = path.join(feedDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const slug = file.replace(/\.md$/, '');

    try {
      const { data, content } = matter(fileContent);

      const service = data.service || data.service_name || data.api || 'Google Cloud';
      const service_id = slugify(service);
      const api = data.api || file.split('-').slice(3).join('-').replace(/_v\d+$/, '');
      const version = api.split('.').pop() || 'v1';

      let dateStr = file.slice(0, 10);
      if (data.date instanceof Date) {
        dateStr = data.date.toISOString().slice(0, 10);
      } else if (typeof data.date === 'string') {
        dateStr = data.date.slice(0, 10);
      }

      const impact = (data.impact || 'medium').toLowerCase() as 'low' | 'medium' | 'high';
      const breaking = Boolean(data.breaking || data.is_breaking);
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const interesting_score = Number(data.interesting_score ?? 5);

      const methodMatches = content.match(/`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`/g) || [];
      const extractedMethods = Array.from(
        new Set(methodMatches.map((m) => m.replace(/`/g, '')))
      ).slice(0, 6);

      let summary = '';
      const summaryMatch = content.match(/## Summary\s*\n\n([\s\S]*?)(?=\n##|$)/);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      } else {
        const paragraphs = content.split('\n\n').filter((p) => !p.startsWith('#') && !p.startsWith('**') && p.trim());
        summary = paragraphs[0] || '';
      }

      const htmlContent = marked.parse(content, { async: false }) as string;
      const ecosystem = (data.ecosystem as Ecosystem) || getEcosystemForService(service || api);
      const category = (data.category as ServiceCategory) || getCategoryForService(service || api);
      const status = (data.status || 'canary').toLowerCase() as ChangeStatus;
      const radar_ring = (data.radar_ring || (breaking ? 'hold' : status === 'released' ? 'adopt' : 'assess')) as RadarRing;
      const radar_quadrant: RadarQuadrant = category.includes('AI') ? 'ai_ml' : category.includes('FinOps') ? 'security_finops' : 'data_platforms';
      const lead_time_days = data.lead_time_days ? Number(data.lead_time_days) : undefined;
      const official_release_date = data.official_release_date ? String(data.official_release_date) : undefined;
      const official_release_notes_url = data.official_release_notes_url ? String(data.official_release_notes_url) : undefined;
      const stats = data.stats || undefined;

      entries.push({
        slug,
        date: dateStr,
        api,
        version,
        service,
        service_id,
        title: data.title || `${service} API Update`,
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
        reaction_counts: { impacts_prod: 0, breaking_me: 0, watch_ga: 0 },
        comments_count: 0,
        stats,
        rawContent: content,
        htmlContent,
        summary,
        detailsHtml: htmlContent,
        extractedMethods,
        ecosystem,
        category,
      });
    } catch (err) {
      console.error(`Error parsing feed entry ${file}:`, err);
    }
  }

  return entries.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.slug.localeCompare(a.slug);
  });
}

/**
 * Universal getter: Fetches from live Firestore/Mock server if active, otherwise falls back to Markdown files
 */
export async function getAllFeedEntries(): Promise<FeedEntry[]> {
  const dbEntries = await fetchFromFirestore();
  if (dbEntries && dbEntries.length > 0) {
    return dbEntries.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.slug.localeCompare(a.slug);
    });
  }
  return getLocalFeedEntries();
}

export async function getActiveDataSource(): Promise<{ type: 'database' | 'filesystem'; label: string }> {
  const dbEntries = await fetchFromFirestore();
  if (dbEntries && dbEntries.length > 0) {
    return { type: 'database', label: `Connected to Mock Firestore (localhost:${DB_HOST.split(':')[1] || '8080'})` };
  }
  return { type: 'filesystem', label: 'Local Filesystem (feed/*.md)' };
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

export async function getServicesList(): Promise<ServiceInfo[]> {
  const entries = await getAllFeedEntries();
  const map = new Map<string, { count: number; breakingCount: number; ecosystem: Ecosystem; category: ServiceCategory }>();

  for (const entry of entries) {
    const existing = map.get(entry.service) || {
      count: 0,
      breakingCount: 0,
      ecosystem: entry.ecosystem || getEcosystemForService(entry.service),
      category: entry.category || getCategoryForService(entry.service),
    };
    existing.count += 1;
    if (entry.breaking) {
      existing.breakingCount += 1;
    }
    map.set(entry.service, existing);
  }

  return Array.from(map.entries())
    .map(([service, { count, breakingCount, ecosystem, category }]) => ({
      service,
      slug: slugify(service),
      count,
      breakingCount,
      ecosystem,
      category,
    }))
    .sort((a, b) => b.count - a.count);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}
