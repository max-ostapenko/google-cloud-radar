import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import * as update_disco from '../scripts/update_disco.ts';

const TMP_DIR = path.join(os.tmpdir(), 'radar_test_disco');

const DISCOVERY_0001_CONTENT = Buffer.from(`{
  "revision": "0001",
  "data": "foo"
}`);

const DISCOVERY_0001_CONTENT_SORTED = Buffer.from(`{\n  "data": "foo",\n  "revision": "0001"\n}`);

const DISCOVERY_0001A_CONTENT = Buffer.from(`{
  "revision": "0001",
  "data": "bar"
}`);

const DISCOVERY_0002_CONTENT = Buffer.from(`{
  "revision": "0002",
  "data": "bar"
}`);

const DISCOVERY_0002_CONTENT_SORTED = Buffer.from(`{\n  "data": "bar",\n  "revision": "0002"\n}`);

const DISCOVERY_0003_CONTENT = Buffer.from(`{
  "revision": "0003",
  "data": "bar"
}`);

const INDEX_1_CONTENT = Buffer.from(`{
  "items": [
    {
      "name": "service1",
      "version": "v1",
      "discoveryRestUrl": "https://example.com/service1_v1.json"
    },
    {
      "name": "service2",
      "version": "v1",
      "discoveryRestUrl": "https://example.com/service2_v1.json"
    }
  ]
}`);

const INDEX_2_CONTENT = Buffer.from(`{
  "items": [
    {
      "name": "service1",
      "version": "v1",
      "discoveryRestUrl": "https://example.com/service1_v1.json"
    },
    {
      "name": "service1",
      "version": "v2",
      "discoveryRestUrl": "https://example.com/service1_v2.json"
    }
  ]
}`);

const INDEX_2_CONTENT_SORTED = Buffer.from(`{\n  "items": [\n    {\n      "discoveryRestUrl": "https://example.com/service1_v1.json",\n      "name": "service1",\n      "version": "v1"\n    },\n    {\n      "discoveryRestUrl": "https://example.com/service1_v2.json",\n      "name": "service1",\n      "version": "v2"\n    }\n  ]\n}`);

describe('Update Disco', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('document info interprets discovery', () => {
    const doc = new update_disco.DocumentInfo(DISCOVERY_0001_CONTENT, 'disc.json');
    expect(doc.filename).toBe('disc.json');
    expect(doc.content).toEqual(DISCOVERY_0001_CONTENT);
    expect(doc.json).toEqual({ revision: '0001', data: 'foo' });
    expect(doc.revision).toBe('0001');
    expect(doc.json_without_revision).toEqual({ data: 'foo' });
  });

  it('document info interprets index', () => {
    const doc = new update_disco.DocumentInfo(INDEX_1_CONTENT);
    expect(doc.filename).toBe('index.json');
    expect(doc.content).toEqual(INDEX_1_CONTENT);
    const expectedJson = {
      items: [
        {
          name: 'service1',
          version: 'v1',
          discoveryRestUrl: 'https://example.com/service1_v1.json',
        },
        {
          name: 'service2',
          version: 'v1',
          discoveryRestUrl: 'https://example.com/service2_v1.json',
        },
      ],
    };
    expect(doc.json).toEqual(expectedJson);
    expect(doc.revision).toBeNull();
    expect(doc.json_without_revision).toEqual(expectedJson);
  });

  it('document info fails parsing', () => {
    const doc = new update_disco.DocumentInfo('{', 'disc.json');
    expect(doc.filename).toBe('disc.json');
    expect(doc.content.toString()).toBe('{');
    expect(doc.json).toBeNull();
    expect(doc.revision).toBeNull();
    expect(doc.json_without_revision).toBeNull();
    expect(doc.json_string).toBe('');
  });

  it('update index', () => {
    const indexPath = path.join(TMP_DIR, 'index.json');
    fs.writeFileSync(indexPath, INDEX_1_CONTENT);
    const doc = new update_disco.DocumentInfo(INDEX_2_CONTENT);
    update_disco.updateIndex(doc, TMP_DIR);
    expect(fs.readFileSync(indexPath)).toEqual(INDEX_2_CONTENT_SORTED);
  });

  it('delete unused files', () => {
    const indexPath = path.join(TMP_DIR, 'index.json');
    const disc1Path = path.join(TMP_DIR, 'disc1.json');
    const disc2Path = path.join(TMP_DIR, 'disc2.json');

    fs.writeFileSync(indexPath, INDEX_1_CONTENT);
    fs.writeFileSync(disc1Path, DISCOVERY_0001_CONTENT);
    fs.writeFileSync(disc2Path, DISCOVERY_0002_CONTENT);

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(disc1Path)).toBe(true);
    expect(fs.existsSync(disc2Path)).toBe(true);

    const indexDoc = new update_disco.DocumentInfo(INDEX_1_CONTENT);
    const disc2Doc = new update_disco.DocumentInfo(DISCOVERY_0002_CONTENT, 'disc2.json');
    update_disco.deleteUnusedFiles(indexDoc, [disc2Doc], TMP_DIR);

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(disc1Path)).toBe(false);
    expect(fs.existsSync(disc2Path)).toBe(true);
  });

  it('update files same revision', () => {
    const discPath = path.join(TMP_DIR, 'disc.json');
    fs.writeFileSync(discPath, DISCOVERY_0001_CONTENT);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0001_CONTENT);

    const discDoc = new update_disco.DocumentInfo(DISCOVERY_0001A_CONTENT, 'disc.json');
    update_disco.updateFiles([discDoc], TMP_DIR);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0001_CONTENT);
  });

  it('update files older revision', () => {
    const discPath = path.join(TMP_DIR, 'disc.json');
    fs.writeFileSync(discPath, DISCOVERY_0002_CONTENT);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0002_CONTENT);

    const discDoc = new update_disco.DocumentInfo(DISCOVERY_0001_CONTENT, 'disc.json');
    update_disco.updateFiles([discDoc], TMP_DIR);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0002_CONTENT);
  });

  it('update files newer revision same data', () => {
    const discPath = path.join(TMP_DIR, 'disc.json');
    fs.writeFileSync(discPath, DISCOVERY_0002_CONTENT);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0002_CONTENT);

    const discDoc = new update_disco.DocumentInfo(DISCOVERY_0003_CONTENT, 'disc.json');
    update_disco.updateFiles([discDoc], TMP_DIR);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0002_CONTENT);
  });

  it('update files newer revision updated data', () => {
    const discPath = path.join(TMP_DIR, 'disc.json');
    fs.writeFileSync(discPath, DISCOVERY_0001_CONTENT);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0001_CONTENT);

    const discDoc = new update_disco.DocumentInfo(DISCOVERY_0002_CONTENT, 'disc.json');
    update_disco.updateFiles([discDoc], TMP_DIR);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0002_CONTENT_SORTED);
  });

  it('update files new file', () => {
    const discPath = path.join(TMP_DIR, 'disc.json');
    expect(fs.existsSync(discPath)).toBe(false);

    const discDoc = new update_disco.DocumentInfo(DISCOVERY_0001_CONTENT, 'disc.json');
    update_disco.updateFiles([discDoc], TMP_DIR);
    expect(fs.readFileSync(discPath)).toEqual(DISCOVERY_0001_CONTENT_SORTED);
  });

  it('load index with mock fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(INDEX_1_CONTENT.toString('utf-8')),
    }));

    const doc = await update_disco.loadIndex();
    expect(doc.content).toEqual(INDEX_1_CONTENT);
  });

  it('load documents with mock fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/service1_v1.json') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(DISCOVERY_0001_CONTENT.toString('utf-8')),
        });
      } else if (url === 'https://example.com/service2_v1.json') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(DISCOVERY_0002_CONTENT.toString('utf-8')),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }));

    const indexDoc = new update_disco.DocumentInfo(INDEX_1_CONTENT);
    const docs = await update_disco.loadDocuments(indexDoc, false);
    expect(docs.length).toBe(2);
    expect(docs[0].content).toEqual(DISCOVERY_0001_CONTENT);
    expect(docs[1].content).toEqual(DISCOVERY_0002_CONTENT);
  });

  it('load documents failures handled gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    const indexDoc = new update_disco.DocumentInfo(INDEX_1_CONTENT);
    const docs = await update_disco.loadDocuments(indexDoc, false);
    expect(docs.length).toBe(0);
  });

  it('is safe discovery URL', () => {
    expect(update_disco.isSafeDiscoveryUrl('https://discovery.googleapis.com/discovery/v1/apis')).toBe(true);
    expect(update_disco.isSafeDiscoveryUrl('https://aiplatform.googleapis.com/$discovery/rest?version=v1')).toBe(true);
    expect(update_disco.isSafeDiscoveryUrl('https://example.com/api.json')).toBe(true);

    expect(update_disco.isSafeDiscoveryUrl('http://discovery.googleapis.com/test')).toBe(false);
    expect(update_disco.isSafeDiscoveryUrl('file:///etc/passwd')).toBe(false);
    expect(update_disco.isSafeDiscoveryUrl('ftp://example.com/test')).toBe(false);
    expect(update_disco.isSafeDiscoveryUrl('http://169.254.169.254/computeMetadata/v1/')).toBe(false);
    expect(update_disco.isSafeDiscoveryUrl('https://malicious-site.attacker.com/disco.json')).toBe(false);
  });

  it('is safe filename', () => {
    expect(update_disco.isSafeFilename('aiplatform', 'v1')).toBe(true);
    expect(update_disco.isSafeFilename('bigquery', 'v2')).toBe(true);
    expect(update_disco.isSafeFilename('admin-directory', 'v1')).toBe(true);

    expect(update_disco.isSafeFilename('../evil', 'v1')).toBe(false);
    expect(update_disco.isSafeFilename('aiplatform', '../evil')).toBe(false);
    expect(update_disco.isSafeFilename('service/nested', 'v1')).toBe(false);
    expect(update_disco.isSafeFilename('service', 'v1/../../cron.d')).toBe(false);
  });
});
