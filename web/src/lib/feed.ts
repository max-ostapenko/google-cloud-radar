import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export type ChangeStatus = 'canary' | 'released' | 'retracted' | 'deprecated';

export interface FeedEntryMeta {
  slug: string;
  date: string;
  api: string;
  service: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  breaking: boolean;
  tags: string[];
  interesting_score: number;
  generated_at?: string;
  status?: ChangeStatus;
  lead_time_days?: number;
  official_release_date?: string;
  official_release_notes_url?: string;
  stats?: {
    upvotes?: number;
    impacted_users_count?: number;
    comments_count?: number;
  };
}

export interface FeedEntry extends FeedEntryMeta {
  status: ChangeStatus;
  rawContent: string;
  htmlContent: string;
  summary: string;
  detailsHtml: string;
  extractedMethods: string[];
  category: ServiceCategory;
}

export type ServiceCategory =
  | 'AI & Machine Learning'
  | 'Data Platform'
  | 'DevOps & Discovery'
  | 'FinOps & Billing'
  | 'Analytics & Web'
  | 'Core & Other';

const SERVICE_CATEGORY_MAP: Record<string, ServiceCategory> = {
  aiplatform: 'AI & Machine Learning',
  'Vertex AI': 'AI & Machine Learning',
  bigquery: 'Data Platform',
  'BigQuery': 'Data Platform',
  biglake: 'Data Platform',
  'BigLake': 'Data Platform',
  bigqueryconnection: 'Data Platform',
  'BigQuery Connection': 'Data Platform',
  bigquerydatapolicy: 'Data Platform',
  'BigQuery Data Policy': 'Data Platform',
  bigquerydatatransfer: 'Data Platform',
  'BigQuery Data Transfer': 'Data Platform',
  bigqueryreservation: 'Data Platform',
  'BigQuery Reservation': 'Data Platform',
  datacatalog: 'Data Platform',
  'Data Catalog': 'Data Platform',
  dataform: 'Data Platform',
  'Dataform': 'Data Platform',
  datalineage: 'Data Platform',
  'Data Lineage': 'Data Platform',
  dataplex: 'Data Platform',
  'Dataplex': 'Data Platform',
  datapipelines: 'Data Platform',
  'Data Pipelines': 'Data Platform',
  analyticshub: 'Data Platform',
  'Analytics Hub': 'Data Platform',
  discovery: 'DevOps & Discovery',
  'Discovery Service': 'DevOps & Discovery',
  billingbudgets: 'FinOps & Billing',
  'Cloud Billing Budgets': 'FinOps & Billing',
  cloudbilling: 'FinOps & Billing',
  'Cloud Billing': 'FinOps & Billing',
  appoptimize: 'FinOps & Billing',
  chromeuxreport: 'Analytics & Web',
  'Chrome UX Report': 'Analytics & Web',
  pagespeedonline: 'Analytics & Web',
  'PageSpeed Insights': 'Analytics & Web',
  searchconsole: 'Analytics & Web',
  'Search Console': 'Analytics & Web',
  tagmanager: 'Analytics & Web',
  'Tag Manager': 'Analytics & Web',
  safebrowsing: 'Core & Other',
  webrisk: 'Core & Other',
};

export function getCategoryForService(serviceOrApi: string): ServiceCategory {
  for (const [key, category] of Object.entries(SERVICE_CATEGORY_MAP)) {
    if (serviceOrApi.toLowerCase().includes(key.toLowerCase())) {
      return category;
    }
  }
  return 'Core & Other';
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
      const api = f.api?.stringValue || '';
      const dateStr = (f.first_detected_at?.stringValue || f.date?.stringValue || id.slice(0, 10)).slice(0, 10);
      const title = f.title?.stringValue || `${service} Update`;
      const summary = f.summary?.stringValue || '';
      const detailsMarkdown = f.details_markdown?.stringValue || summary;
      const impact = (f.impact?.stringValue || 'medium').toLowerCase() as 'low' | 'medium' | 'high';
      const breaking = Boolean(f.is_breaking?.booleanValue ?? f.breaking?.booleanValue);
      const interesting_score = parseInt(f.interesting_score?.integerValue || '5', 10);
      const status = (f.status?.stringValue || 'canary') as ChangeStatus;
      const lead_time_days = f.lead_time_days ? parseInt(f.lead_time_days.integerValue, 10) : undefined;
      const official_release_date = f.official_release_date?.stringValue;
      const official_release_notes_url = f.official_release_notes_url?.stringValue;

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
      const category = getCategoryForService(service || api);

      return {
        slug: id,
        date: dateStr,
        api,
        service,
        title,
        impact,
        breaking,
        tags,
        interesting_score,
        status,
        lead_time_days,
        official_release_date,
        official_release_notes_url,
        stats,
        rawContent: detailsMarkdown,
        htmlContent,
        summary,
        detailsHtml: htmlContent,
        extractedMethods,
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
      const api = data.api || file.split('-').slice(3).join('-').replace(/_v\d+$/, '');

      let dateStr = file.slice(0, 10);
      if (data.date instanceof Date) {
        dateStr = data.date.toISOString().slice(0, 10);
      } else if (typeof data.date === 'string') {
        dateStr = data.date.slice(0, 10);
      }

      const impact = (data.impact || 'medium').toLowerCase() as 'low' | 'medium' | 'high';
      const breaking = Boolean(data.breaking);
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
      const category = getCategoryForService(service || api);
      const status = (data.status || 'canary').toLowerCase() as ChangeStatus;
      const lead_time_days = data.lead_time_days ? Number(data.lead_time_days) : undefined;
      const official_release_date = data.official_release_date ? String(data.official_release_date) : undefined;
      const official_release_notes_url = data.official_release_notes_url ? String(data.official_release_notes_url) : undefined;
      const stats = data.stats || undefined;

      entries.push({
        slug,
        date: dateStr,
        api,
        service,
        title: data.title || `${service} API Update`,
        impact,
        breaking,
        tags,
        interesting_score,
        status,
        lead_time_days,
        official_release_date,
        official_release_notes_url,
        stats,
        rawContent: content,
        htmlContent,
        summary,
        detailsHtml: htmlContent,
        extractedMethods,
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

export async function getServicesList(): Promise<{ service: string; count: number; category: ServiceCategory; slug: string }[]> {
  const entries = await getAllFeedEntries();
  const map = new Map<string, { count: number; category: ServiceCategory }>();

  for (const entry of entries) {
    const existing = map.get(entry.service) || { count: 0, category: entry.category };
    existing.count += 1;
    map.set(entry.service, existing);
  }

  return Array.from(map.entries())
    .map(([service, { count, category }]) => ({
      service,
      slug: slugify(service),
      count,
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
