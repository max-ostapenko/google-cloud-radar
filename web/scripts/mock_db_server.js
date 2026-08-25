#!/usr/bin/env node

/**
 * Pure Node.js Mock Firestore REST Server (Zero Java required).
 *
 * Emulates the Firestore REST API on port 8080.
 * Automatically loads all 51+ change records from feed/*.md and merges seed fixtures.
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
const FEED_DIR = path.resolve(__dirname, '../../feed');
const PORT = process.env.PORT || 8080;

// In-memory store: Map<collectionName, Map<docId, documentData>>
const store = new Map();

function initStore() {
  store.set('changes', new Map());
  store.set('discussions', new Map());
  store.set('votes', new Map());

  const changesMap = store.get('changes');

  // 1. Load from feed/*.md if available
  if (fs.existsSync(FEED_DIR)) {
    const files = fs.readdirSync(FEED_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
    for (const file of files) {
      const filePath = path.join(FEED_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const slug = file.replace(/\.md$/, '');

      let title = `${slug} Update`;
      let service = 'Google Cloud';
      let api = slug.split('-').slice(3).join('-');
      let impact = 'medium';
      let breaking = false;
      let interestingScore = 5;
      let body = content;

      if (content.startsWith('---')) {
        const parts = content.split('---');
        if (parts.length >= 3) {
          const fm = parts[1];
          body = parts.slice(2).join('---').trim();
          for (const line of fm.split('\n')) {
            const [k, ...vParts] = line.split(':');
            if (k && vParts.length > 0) {
              const key = k.trim();
              const val = vParts.join(':').trim().replace(/^['"]|['"]$/g, '');
              if (key === 'service') service = val;
              if (key === 'api') api = val;
              if (key === 'title') title = val;
              if (key === 'impact') impact = val.toLowerCase();
              if (key === 'breaking') breaking = val === 'true';
              if (key === 'interesting_score') interestingScore = parseInt(val, 10);
            }
          }
        }
      }

      const methodMatches = Array.from(new Set(body.match(/`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`/g) || []))
        .map((m) => m.replace(/`/g, ''))
        .slice(0, 6);

      const summaryMatch = body.match(/## Summary\s*\n\n([\s\S]*?)(?=\n##|$)/);
      const summary = summaryMatch ? summaryMatch[1].trim() : body.split('\n\n')[0];

      changesMap.set(slug, {
        id: slug,
        slug,
        service_name: service,
        api,
        title,
        summary,
        details_markdown: body,
        impact,
        is_breaking: breaking,
        interesting_score: interestingScore,
        status: 'canary',
        tags: [service, 'Google Cloud'],
        extracted_methods: methodMatches,
        first_detected_at: `${slug.slice(0, 10)}T00:00:00.000Z`,
        last_updated_at: `${slug.slice(0, 10)}T00:00:00.000Z`,
      });
    }
    console.log(`📦 Loaded ${changesMap.size} changes from feed/*.md`);
  }

  // 2. Layer seed_data.json on top (released items, lead time badges, telemetry)
  if (fs.existsSync(SEED_FILE)) {
    try {
      const seedItems = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
      for (const item of seedItems) {
        changesMap.set(item.id, item);
      }
      console.log(`✨ Layered ${seedItems.length} test fixtures from seed_data.json`);
    } catch (err) {
      console.warn('⚠️ Could not load seed_data.json:', err.message);
    }
  }
}

// Convert native JS object to Firestore REST fields schema
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map((item) => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return { integerValue: String(item) };
            return { stringValue: JSON.stringify(item) };
          }),
        },
      };
    } else if (typeof v === 'object' && v !== null) {
      fields[k] = { stringValue: JSON.stringify(v) };
    }
  }
  return fields;
}

// Convert Firestore REST fields back to standard JS object
function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, f] of Object.entries(fields)) {
    if ('stringValue' in f) obj[k] = f.stringValue;
    else if ('integerValue' in f) obj[k] = parseInt(f.integerValue, 10);
    else if ('doubleValue' in f) obj[k] = f.doubleValue;
    else if ('booleanValue' in f) obj[k] = f.booleanValue;
    else if ('arrayValue' in f && f.arrayValue.values) {
      obj[k] = f.arrayValue.values.map((v) => v.stringValue || v.integerValue || JSON.stringify(v));
    }
  }
  return obj;
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'gcp-discovery-radar-mock-firestore',
      collections: {
        changes: store.get('changes')?.size || 0,
        discussions: store.get('discussions')?.size || 0,
        votes: store.get('votes')?.size || 0,
      },
    }, null, 2));
    return;
  }

  // Parse Firestore REST path: /v1/projects/:project/databases/(default)/documents/:collection(/:docId)?
  const match = pathname.match(/^\/v1\/projects\/[^\/]+\/databases\/[^\/]+\/documents\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?/);

  if (match) {
    const collectionName = match[1];
    const docId = match[2];

    if (!store.has(collectionName)) {
      store.set(collectionName, new Map());
    }
    const collection = store.get(collectionName);

    // GET /collection (list documents)
    if (req.method === 'GET' && !docId) {
      const documents = Array.from(collection.values()).map((doc) => ({
        name: `projects/gcp-cloud-radar/databases/(default)/documents/${collectionName}/${doc.id || doc.slug}`,
        fields: toFirestoreFields(doc),
        createTime: doc.first_detected_at || new Date().toISOString(),
        updateTime: doc.last_updated_at || new Date().toISOString(),
      }));

      console.log(`📥 [MOCK FIRESTORE] GET /${collectionName} -> Serving ${documents.length} documents`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ documents }, null, 2));
      return;
    }

    // GET /collection/:docId
    if (req.method === 'GET' && docId) {
      if (collection.has(docId)) {
        const doc = collection.get(docId);
        console.log(`📥 [MOCK FIRESTORE] GET /${collectionName}/${docId} -> 200 OK`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: `projects/gcp-cloud-radar/databases/(default)/documents/${collectionName}/${docId}`,
          fields: toFirestoreFields(doc),
        }, null, 2));
      } else {
        console.log(`⚠️ [MOCK FIRESTORE] GET /${collectionName}/${docId} -> 404 Not Found`);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 404, message: `Document ${docId} not found` } }));
      }
      return;
    }

    // PATCH / POST / PUT (upsert document)
    if (['PATCH', 'POST', 'PUT'].includes(req.method) && docId) {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const incomingData = parsed.fields ? fromFirestoreFields(parsed.fields) : parsed;
          const existing = collection.get(docId) || {};
          const merged = { ...existing, ...incomingData, id: docId, last_updated_at: new Date().toISOString() };
          collection.set(docId, merged);

          console.log(`  [MOCK DB] Upserted ${collectionName}/${docId}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            name: `projects/gcp-cloud-radar/databases/(default)/documents/${collectionName}/${docId}`,
            fields: toFirestoreFields(merged),
          }, null, 2));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 400, message: err.message } }));
        }
      });
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

initStore();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 Mock Firestore Server running at http://127.0.0.1:${PORT}`);
  console.log(`👉 Health endpoint: http://127.0.0.1:${PORT}/health`);
  console.log(`👉 Changes collection: http://127.0.0.1:${PORT}/v1/projects/gcp-cloud-radar/databases/(default)/documents/changes\n`);
});
