#!/usr/bin/env node

/**
 * Pure Node.js Mock Firestore REST Server (Zero Java required).
 *
 * Emulates the Firestore REST API on port 8080.
 * Automatically loads all change records from data/changes/*.json and merges seed fixtures.
 *
 * Usage:
 *   node scripts/mock_db_server.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(__dirname, '../src/data/seed_data.json');
const DATA_CHANGES_DIR = path.resolve(__dirname, '../../data/changes');
const PORT = process.env.PORT || 8080;

// In-memory store: Map<collectionName, Map<docId, documentData>>
const store = new Map();

function initStore() {
  store.set('changes', new Map());
  store.set('discussions', new Map());
  store.set('votes', new Map());

  const changesMap = store.get('changes');

  // 1. Load from data/changes/*.json if available
  if (fs.existsSync(DATA_CHANGES_DIR)) {
    const files = fs.readdirSync(DATA_CHANGES_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(DATA_CHANGES_DIR, file);
      try {
        const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const slug = doc.slug || doc.id || file.replace(/\.json$/, '');
        changesMap.set(slug, {
          id: slug,
          slug,
          service_name: doc.service_name || doc.service || 'Google Cloud',
          api: doc.api || '',
          title: doc.title || `${slug} Update`,
          summary: doc.summary || '',
          details_markdown: doc.details || doc.summary || '',
          impact: doc.impact || 'medium',
          is_breaking: Boolean(doc.breaking),
          interesting_score: Number(doc.interesting_score ?? 5),
          status: doc.status || 'canary',
          radar_ring: doc.radar_ring || (doc.breaking ? 'hold' : 'assess'),
          tags: doc.tags || ['Google Cloud'],
          extracted_methods: doc.extracted_methods || [],
          lead_time_days: doc.lead_time_days,
          official_release_date: doc.official_release_date,
          official_release_notes_url: doc.official_release_notes_url,
          first_detected_at: `${slug.slice(0, 10)}T00:00:00.000Z`,
          last_updated_at: `${slug.slice(0, 10)}T00:00:00.000Z`,
        });
      } catch (err) {
        console.warn(`⚠️ Could not parse ${file}:`, err.message);
      }
    }
    console.log(`📦 Loaded ${changesMap.size} changes from data/changes/*.json`);
  }

  // 2. Layer seed_data.json on top if needed
  if (fs.existsSync(SEED_FILE)) {
    try {
      const seedItems = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
      for (const item of seedItems) {
        if (!changesMap.has(item.id)) {
          changesMap.set(item.id, item);
        }
      }
      console.log(`✨ Layered seed fixtures from seed_data.json`);
    } catch (err) {
      console.warn('⚠️ Could not load seed_data.json:', err.message);
    }
  }
}

// Convert native JS object to Firestore REST API value representation
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return { timestampValue: val.endsWith('Z') ? val : `${val}Z` };
    }
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Convert Firestore REST document fields to plain JS object
function fromFirestoreFields(fields = {}) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) obj[k] = v.stringValue;
    else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) obj[k] = parseFloat(v.doubleValue);
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else if ('timestampValue' in v) obj[k] = v.timestampValue;
    else if ('nullValue' in v) obj[k] = null;
    else if ('arrayValue' in v) {
      obj[k] = (v.arrayValue.values || []).map((item) => {
        if ('stringValue' in item) return item.stringValue;
        if ('integerValue' in item) return parseInt(item.integerValue, 10);
        return item;
      });
    } else if ('mapValue' in v) {
      obj[k] = fromFirestoreFields(v.mapValue.fields || {});
    }
  }
  return obj;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

initStore();

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === '/' || pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'Google Cloud Radar Mock Firestore Server',
      changes_count: store.get('changes')?.size || 0,
    });
  }

  // Regex pattern for Firestore REST API document paths:
  const match = pathname.match(/^\/v1\/projects\/([^/]+)\/databases\/([^/]+)\/documents(?:\/([^/]+)(?:\/(.+))?)?$/);

  if (!match) {
    return sendJson(res, 404, { error: 'Not Found' });
  }

  const [, , , collection, docId] = match;

  // 1. List / Query Collection
  if (collection && !docId) {
    if (!store.has(collection)) {
      store.set(collection, new Map());
    }
    const collMap = store.get(collection);

    if (req.method === 'GET') {
      const documents = Array.from(collMap.entries()).map(([id, data]) => ({
        name: `projects/gcp-cloud-radar/databases/radar/documents/${collection}/${id}`,
        fields: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, toFirestoreValue(v)])
        ),
        createTime: data.first_detected_at || '2026-08-01T00:00:00Z',
        updateTime: data.last_updated_at || '2026-08-01T00:00:00Z',
      }));

      return sendJson(res, 200, { documents });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const customId = url.searchParams.get('documentId') || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const docData = body.fields ? fromFirestoreFields(body.fields) : body;
      docData.id = customId;
      docData.created_at = new Date().toISOString();

      collMap.set(customId, docData);
      console.log(`[POST] /${collection}/${customId}`);

      return sendJson(res, 200, {
        name: `projects/gcp-cloud-radar/databases/radar/documents/${collection}/${customId}`,
        fields: Object.fromEntries(
          Object.entries(docData).map(([k, v]) => [k, toFirestoreValue(v)])
        ),
      });
    }
  }

  // 2. Single Document Operations
  if (collection && docId) {
    if (!store.has(collection)) {
      store.set(collection, new Map());
    }
    const collMap = store.get(collection);

    if (req.method === 'GET') {
      const doc = collMap.get(docId);
      if (!doc) {
        return sendJson(res, 404, { error: `Document ${docId} not found in ${collection}` });
      }

      return sendJson(res, 200, {
        name: `projects/gcp-cloud-radar/databases/radar/documents/${collection}/${docId}`,
        fields: Object.fromEntries(
          Object.entries(doc).map(([k, v]) => [k, toFirestoreValue(v)])
        ),
      });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await readBody(req);
      const incoming = body.fields ? fromFirestoreFields(body.fields) : body;
      const existing = collMap.get(docId) || { id: docId };

      const merged = { ...existing, ...incoming, last_updated_at: new Date().toISOString() };
      collMap.set(docId, merged);
      console.log(`[PATCH] /${collection}/${docId}`);

      return sendJson(res, 200, {
        name: `projects/gcp-cloud-radar/databases/radar/documents/${collection}/${docId}`,
        fields: Object.fromEntries(
          Object.entries(merged).map(([k, v]) => [k, toFirestoreValue(v)])
        ),
      });
    }
  }

  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 Google Cloud Radar Mock Firestore Server running at http://127.0.0.1:${PORT}`);
  console.log(`   Connected collections: changes (${store.get('changes').size}), discussions (${store.get('discussions').size}), votes (${store.get('votes').size})\n`);
});
