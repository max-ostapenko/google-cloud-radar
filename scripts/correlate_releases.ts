/**
 * Automated Canary -> GA Release Correlator for Google Cloud Radar.
 *
 * Scans official Google Cloud release note RSS/Atom feeds, detects when an
 * unpublished Canary method or feature is officially documented, calculates
 * the lead time (in days), and updates the JSON records and Firestore documents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { Firestore } from '@google-cloud/firestore';
import {
  getOfficialReleaseFeeds,
  getReleaseFeedUrls,
} from './taxonomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ARCHIVE_RETENTION_DAYS = 180;
const _FEED_CACHE: Record<string, any[]> = {};

export function calculateLeadTime(canaryDateStr: string, gaDateStr: string): number {
  try {
    const d1 = new Date(canaryDateStr.slice(0, 10) + 'T00:00:00Z');
    const d2 = new Date(gaDateStr.slice(0, 10) + 'T00:00:00Z');
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
    return Math.max(0, diffDays);
  } catch {
    return 0;
  }
}

export function extractBullets(content: string, title = ''): string[] {
  if (!content) return [];
  const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
  return sentences.slice(0, 5);
}

export function parseFeedXml(xmlContent: string): any[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  const parsed = parser.parse(xmlContent);
  const entries: any[] = [];

  // 1. Atom feed (<feed><entry>...</feed>)
  if (parsed.feed && parsed.feed.entry) {
    const rawEntries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    for (const item of rawEntries) {
      const title = typeof item.title === 'string' ? item.title : item.title?.['#text'] || '';
      let url = '';
      if (typeof item.link === 'string') {
        url = item.link;
      } else if (item.link?.['@_href']) {
        url = item.link['@_href'];
      } else if (Array.isArray(item.link)) {
        const alt = item.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
        url = alt?.['@_href'] || item.link[0]?.['@_href'] || '';
      }

      const rawDate = item.updated || item.published || '';
      const dateStr = String(rawDate).slice(0, 10);
      const content = typeof item.content === 'string' ? item.content : item.content?.['#text'] || item.summary || '';

      if (title || content) {
        entries.push({
          title,
          url,
          date: dateStr,
          content: String(content),
          bullets: extractBullets(String(content), title),
        });
      }
    }
    return entries;
  }

  // 2. RSS feed (<rss><channel><item>...</rss>)
  const channel = parsed.rss?.channel || parsed.channel;
  if (channel && channel.item) {
    const rawItems = Array.isArray(channel.item) ? channel.item : [channel.item];
    for (const item of rawItems) {
      const title = typeof item.title === 'string' ? item.title : item.title?.['#text'] || '';
      const url = typeof item.link === 'string' ? item.link : item.link?.['#text'] || item.guid?.['#text'] || '';
      let dateStr = '';
      if (item.pubDate) {
        try {
          dateStr = new Date(item.pubDate).toISOString().slice(0, 10);
        } catch {
          dateStr = String(item.pubDate).slice(0, 10);
        }
      }
      const content = typeof item.description === 'string' ? item.description : item.description?.['#text'] || '';

      entries.push({
        title,
        url,
        date: dateStr,
        content: String(content),
        bullets: extractBullets(String(content), title),
      });
    }
  }

  return entries;
}

export function matchChangeAgainstReleases(changeMeta: Record<string, any>, releaseEntries: any[]): any | null {
  const firstDetected = String(
    changeMeta.first_detected || changeMeta.date || changeMeta.first_detected_at || ''
  ).slice(0, 10);

  const extractedMethods: string[] = (changeMeta.extracted_methods || []).map((m: string) => m.toLowerCase());
  const methodLeafs = extractedMethods.map((m) => m.split('.').pop() || m);

  for (const release of releaseEntries) {
    const relDate = release.date;
    if (!relDate || (firstDetected && relDate < firstDetected)) {
      continue; // Skip releases published strictly before canary detection
    }

    const relText = `${release.title} ${release.content}`.toLowerCase();

    // Direct RPC / Method match
    for (let i = 0; i < extractedMethods.length; i++) {
      const fullMethod = extractedMethods[i];
      const leaf = methodLeafs[i];
      if (fullMethod && relText.includes(fullMethod)) {
        return release;
      }
      if (leaf && leaf.length >= 6 && relText.includes(leaf)) {
        return release;
      }
    }
  }

  return null;
}

export function loadReleaseArchive(archivePath: string): Record<string, any[]> {
  if (fs.existsSync(archivePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data;
      }
    } catch (err: any) {
      console.warn(`Warning loading release archive: ${err.message}`);
    }
  }
  return {};
}

export function saveReleaseArchive(archivePath: string, archiveData: Record<string, any[]>): void {
  try {
    const cutoffDate = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const leanArchive: Record<string, any[]> = {};
    for (const [feedUrl, entries] of Object.entries(archiveData)) {
      const feedEntries = [];
      for (const e of entries) {
        const d = e.date || '';
        if (d && d < cutoffDate) continue;
        feedEntries.push({
          title: e.title || '',
          url: e.url || '',
          date: d,
          bullets: e.bullets || extractBullets(e.content || '', e.title || ''),
        });
      }
      if (feedEntries.length > 0) {
        leanArchive[feedUrl] = feedEntries;
      }
    }

    fs.mkdirSync(path.dirname(path.resolve(archivePath)), { recursive: true });
    fs.writeFileSync(archivePath, JSON.stringify(leanArchive, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    console.warn(`Warning saving release archive: ${err.message}`);
  }
}

export function updateJsonFile(filePath: string, releaseInfo: any, leadTimeDays: number): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    data.status = 'released';
    data.lead_time_days = leadTimeDays;
    data.official_release_date = releaseInfo.date;
    data.official_release_notes_url = releaseInfo.url || '';

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return true;
  } catch (err: any) {
    console.error(`Error updating ${filePath}: ${err.message}`);
    return false;
  }
}

export async function updateFirestoreRelease(
  firestore: Firestore,
  slug: string,
  releaseInfo: any,
  leadTimeDays: number
): Promise<boolean> {
  try {
    const relDate = `${releaseInfo.date.slice(0, 10)}T00:00:00.000Z`;
    await firestore.collection('changes').doc(slug).update({
      status: 'released',
      lead_time_days: leadTimeDays,
      official_release_date: relDate,
      official_release_notes_url: releaseInfo.url || '',
      last_updated_at: new Date().toISOString(),
    });
    return true;
  } catch (err: any) {
    console.error(`Error updating Firestore document ${slug}: ${err.message}`);
    return false;
  }
}

export async function fetchFeedEntries(feedUrl: string, archive?: Record<string, any[]>): Promise<any[]> {
  if (_FEED_CACHE[feedUrl]) {
    return _FEED_CACHE[feedUrl];
  }

  let entries: any[] = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(feedUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const xml = await res.text();
      entries = parseFeedXml(xml);
    }
  } catch (err: any) {
    console.warn(`Could not fetch live feed from ${feedUrl}: ${err.message}`);
  }

  // Merge with archive
  if (archive && archive[feedUrl]) {
    const seen = new Set(entries.map((e) => `${e.date}-${e.title}`));
    for (const archItem of archive[feedUrl]) {
      const key = `${archItem.date}-${archItem.title}`;
      if (!seen.has(key)) {
        entries.push(archItem);
        seen.add(key);
      }
    }
  }

  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  _FEED_CACHE[feedUrl] = entries;
  return entries;
}

export async function runCorrelation(options: {
  dataDir?: string;
  archivePath?: string;
  projectId?: string;
  databaseId?: string;
  dryRun?: boolean;
}): Promise<any[]> {
  const dataDir = options.dataDir || path.resolve(__dirname, '../data');
  const changesDir = path.join(dataDir, 'changes');
  const archivePath = options.archivePath || path.join(dataDir, 'release_notes_archive.json');

  const archive = loadReleaseArchive(archivePath);

  let firestore: Firestore | null = null;
  if (!options.dryRun && options.projectId) {
    try {
      firestore = new Firestore({
        projectId: options.projectId,
        databaseId: options.databaseId || '(default)',
      });
    } catch (err: any) {
      console.warn(`Could not initialise Firestore: ${err.message}`);
    }
  }

  const changeFiles = fs.existsSync(changesDir)
    ? fs.readdirSync(changesDir).filter((f) => f.endsWith('.json'))
    : [];

  const matchedResults: any[] = [];

  for (const file of changeFiles) {
    const filePath = path.join(changesDir, file);
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (doc.status === 'released') continue;

      const apiName = doc.api ? doc.api.split('.')[0] : '';
      const feedUrls = getReleaseFeedUrls(apiName);
      if (feedUrls.length === 0) continue;

      for (const feedUrl of feedUrls) {
        const releaseEntries = await fetchFeedEntries(feedUrl, archive);
        const match = matchChangeAgainstReleases(doc, releaseEntries);
        if (match) {
          const leadTime = calculateLeadTime(doc.date || doc.id.slice(0, 10), match.date);
          matchedResults.push({
            slug: doc.id || doc.slug || file.replace('.json', ''),
            filePath,
            releaseInfo: match,
            leadTimeDays: leadTime,
          });

          if (!options.dryRun) {
            updateJsonFile(filePath, match, leadTime);
            if (firestore) {
              await updateFirestoreRelease(
                firestore,
                doc.id || doc.slug,
                match,
                leadTime
              );
            }
          }
          break;
        }
      }
    } catch (err: any) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  saveReleaseArchive(archivePath, archive);
  return matchedResults;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const projectIdx = args.indexOf('--project');
  const projectId = projectIdx !== -1 ? args[projectIdx + 1] : process.env.GCP_PROJECT || 'gcp-cloud-radar';
  const databaseIdx = args.indexOf('--database');
  const databaseId = databaseIdx !== -1 ? args[databaseIdx + 1] : 'radar';

  runCorrelation({ dryRun, projectId, databaseId }).catch((err) => {
    console.error('Fatal correlate_releases error:', err);
    process.exit(1);
  });
}
