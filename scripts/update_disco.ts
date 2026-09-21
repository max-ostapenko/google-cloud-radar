/**
 * Pulls the latest discovery documents from the Google API discovery service
 * and updates the discoveries directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWatchedApi } from './taxonomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ALLOWED_DISCOVERY_HOSTS = new Set([
  'discovery.googleapis.com',
  'example.com', // Mock testing host
]);

export function isSafeDiscoveryUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const host = (parsed.hostname || '').toLowerCase().split(':')[0];
    if (ALLOWED_DISCOVERY_HOSTS.has(host) || host.endsWith('.googleapis.com')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isSafeFilename(name: string, version: string): boolean {
  if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return false;
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(version)) return false;
  const filename = `${name}.${version}.json`;
  return path.basename(filename) === filename;
}

export function sortKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

export class DocumentInfo {
  filename: string;
  content: Buffer;
  json: any;
  revision: string | null = null;
  json_without_revision: any = null;
  json_string: string = '';

  constructor(content: Buffer | string, filename?: string) {
    this.filename = filename || 'index.json';
    this.content = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    try {
      this.json = JSON.parse(this.content.toString('utf-8'));
      this.revision = this.json.revision ?? null;

      const withoutRev = { ...this.json };
      delete withoutRev.revision;
      delete withoutRev.etag;
      this.json_without_revision = withoutRev;

      const sorted = sortKeys(this.json);
      this.json_string = JSON.stringify(sorted, null, 2);
    } catch {
      this.json = null;
      this.json_without_revision = null;
      this.revision = null;
      this.json_string = '';
    }
  }

  // Alias getter for backward compatibility
  get jsonWithoutRevision() {
    return this.json_without_revision;
  }

  get jsonString() {
    return this.json_string;
  }
}

export async function loadIndex(
  url = 'https://discovery.googleapis.com/discovery/v1/apis'
): Promise<DocumentInfo> {
  console.log('LOADING index document ...');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Got HTTP status ${res.status} for discovery index`);
  }
  const text = await res.text();
  const doc = new DocumentInfo(text);
  if (doc.json === null) {
    throw new Error('Unable to parse discovery index');
  }
  return doc;
}

export async function loadDocuments(
  indexDocument: DocumentInfo,
  whitelistCheck = true
): Promise<DocumentInfo[]> {
  console.log('LOADING service documents ...');
  const serviceDocuments: DocumentInfo[] = [];
  const items = indexDocument.json?.items || [];

  for (const item of items) {
    const name: string = item.name;
    const version: string = item.version;
    const discoveryRestUrl: string = item.discoveryRestUrl;
    const filename = `${name}.${version}.json`;

    if (whitelistCheck && !isWatchedApi(name)) {
      continue;
    }

    if (!isSafeFilename(name, version)) {
      console.error(`Unsafe service name or version rejected: ${name}/${version}`);
      continue;
    }

    if (!isSafeDiscoveryUrl(discoveryRestUrl)) {
      console.error(`Untrusted URL scheme or host rejected for ${discoveryRestUrl}`);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(discoveryRestUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`HTTP status ${res.status} when loading ${filename} from ${discoveryRestUrl}`);
        continue;
      }

      const text = await res.text();
      const doc = new DocumentInfo(text, filename);
      if (doc.revision === null) {
        console.error(`Malformed document for ${filename} from ${discoveryRestUrl}`);
        continue;
      }

      serviceDocuments.push(doc);
    } catch (err: any) {
      console.error(`Failed to load ${filename} from ${discoveryRestUrl}:`, err.message);
      continue;
    }
  }

  return serviceDocuments;
}

export function deleteUnusedFiles(
  indexDocument: DocumentInfo,
  serviceDocuments: DocumentInfo[],
  targetDir = '.'
): void {
  const expectedNames = new Set<string>([indexDocument.filename]);
  for (const doc of serviceDocuments) {
    expectedNames.add(doc.filename);
  }

  const indexItems = indexDocument.json?.items || [];
  for (const item of indexItems) {
    if (item.name && item.version) {
      expectedNames.add(`${item.name}.${item.version}.json`);
    }
  }

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json'));
  for (const filename of files) {
    if (expectedNames.has(filename)) continue;
    console.log(`REMOVING decommissioned file ${filename}`);
    fs.unlinkSync(path.join(targetDir, filename));
  }
}

export function updateFiles(
  serviceDocuments: DocumentInfo[],
  targetDir = '.'
): void {
  for (const document of serviceDocuments) {
    const documentRevision = document.revision;
    if (!documentRevision) continue;
    const filename = document.filename;
    const fullPath = path.join(targetDir, filename);

    if (fs.existsSync(fullPath)) {
      const existingContent = fs.readFileSync(fullPath);
      const existing = new DocumentInfo(existingContent, filename);
      const existingRevision = existing.revision || '(unknown)';

      if (existingRevision > documentRevision) {
        continue;
      } else if (existingRevision === documentRevision) {
        continue;
      } else if (
        JSON.stringify(existing.json_without_revision) ===
        JSON.stringify(document.json_without_revision)
      ) {
        continue;
      }

      console.log(`UPDATING revision ${existingRevision} to ${documentRevision} for ${filename}`);
      fs.writeFileSync(fullPath, Buffer.from(document.json_string));
    } else {
      console.log(`WRITING new file ${filename} at revision ${documentRevision}`);
      fs.writeFileSync(fullPath, Buffer.from(document.json_string));
    }
  }
}

export function updateIndex(indexDocument: DocumentInfo, targetDir = '.'): void {
  const filename = indexDocument.filename;
  const fullPath = path.join(targetDir, filename);
  if (fs.existsSync(fullPath)) {
    const existingContent = fs.readFileSync(fullPath);
    if (existingContent.equals(indexDocument.content)) {
      return;
    }
  }
  console.log(`UPDATING index file ${filename}`);
  fs.writeFileSync(fullPath, Buffer.from(indexDocument.json_string));
}

export async function main(): Promise<void> {
  const discoveriesDir = path.resolve(__dirname, '../discoveries');
  const indexDoc = await loadIndex();
  const serviceDocs = await loadDocuments(indexDoc);
  deleteUnusedFiles(indexDoc, serviceDocs, discoveriesDir);
  updateFiles(serviceDocs, discoveriesDir);
  updateIndex(indexDoc, discoveriesDir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal update_disco error:', err);
    process.exit(1);
  });
}
