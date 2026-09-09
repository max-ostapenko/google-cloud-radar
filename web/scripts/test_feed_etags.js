import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

const CORE_FEEDS = [
  { source: '/api/feed.json', distPath: path.join(webDir, 'dist', 'api', 'feed.json') },
  { source: '/rss.xml', distPath: path.join(webDir, 'dist', 'rss.xml') },
  { source: '/llms.txt', distPath: path.join(webDir, 'dist', 'llms.txt') },
];

const firebaseJsonPath = path.join(webDir, 'firebase.json');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { headers, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- 1. Verifying Static Build & firebase.json Header Config ---');

  if (!fs.existsSync(firebaseJsonPath)) {
    throw new Error(`firebase.json not found at ${firebaseJsonPath}`);
  }

  const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
  const headerRules = firebaseJson.hosting?.headers || [];

  for (const feed of CORE_FEEDS) {
    assert.ok(fs.existsSync(feed.distPath), `Dist file missing: ${feed.distPath}`);
    const fileContent = fs.readFileSync(feed.distPath);
    const computedEtag = `"${createHash('sha256').update(fileContent).digest('hex')}"`;

    const rule = headerRules.find((r) => r.source === feed.source);
    assert.ok(rule, `Missing header rule in firebase.json for ${feed.source}`);

    const etagHeaderRule = rule.headers.find((h) => h.key.toLowerCase() === 'etag');
    assert.ok(etagHeaderRule, `Missing ETag header rule in firebase.json for ${feed.source}`);
    assert.strictEqual(
      etagHeaderRule.value,
      computedEtag,
      `ETag in firebase.json for ${feed.source} (${etagHeaderRule.value}) does not match dist SHA-256 (${computedEtag})`
    );

    console.log(`✓ ${feed.source}: ETag in firebase.json matches computed SHA-256 (${computedEtag})`);
  }

  console.log('\n--- 2. Verifying Edge Hosting Rules & Conditional Requests (304 Not Modified) ---');

  // Spin up local edge hosting simulator based on firebase.json and dist/
  const server = http.createServer((req, res) => {
    const feed = CORE_FEEDS.find((f) => f.source === req.url);
    if (!feed) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    const rule = headerRules.find((r) => r.source === feed.source);
    if (rule) {
      for (const h of rule.headers) {
        res.setHeader(h.key, h.value);
      }
    }

    const etagHeader = rule?.headers.find((h) => h.key.toLowerCase() === 'etag')?.value;
    const ifNoneMatch = req.headers['if-none-match'];

    if (ifNoneMatch && etagHeader && ifNoneMatch === etagHeader) {
      res.statusCode = 304;
      return res.end();
    }

    const content = fs.readFileSync(feed.distPath);
    res.statusCode = 200;
    res.end(content);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (const feed of CORE_FEEDS) {
      const url = `${baseUrl}${feed.source}`;
      console.log(`Testing Edge Simulator for ${feed.source}...`);

      // Unconditional GET
      const res1 = await fetchUrl(url);
      assert.strictEqual(res1.statusCode, 200, `Expected 200 OK for ${feed.source}`);
      assert.ok(res1.body.length > 0, `Expected non-empty body for ${feed.source}`);
      const etag = res1.headers['etag'];
      assert.ok(etag, `Missing ETag header in response for ${feed.source}`);
      console.log(`  ✓ Unconditional GET returned 200 OK with ETag: ${etag}`);

      // Conditional GET with matching If-None-Match
      const res2 = await fetchUrl(url, { 'if-none-match': etag });
      assert.strictEqual(res2.statusCode, 304, `Expected 304 Not Modified for ${feed.source}`);
      assert.strictEqual(res2.body, '', `Expected empty body for 304 Not Modified on ${feed.source}`);
      console.log(`  ✓ Conditional GET with matching If-None-Match returned 304 Not Modified with empty body`);

      // Conditional GET with non-matching If-None-Match
      const res3 = await fetchUrl(url, { 'if-none-match': '"invalid-etag-9999"' });
      assert.strictEqual(res3.statusCode, 200, `Expected 200 OK for ${feed.source}`);
      assert.strictEqual(res3.body, res1.body, `Expected full body for non-matching If-None-Match on ${feed.source}`);
      console.log(`  ✓ Conditional GET with non-matching If-None-Match returned 200 OK with full payload`);
    }
  } finally {
    server.close();
  }

  // Also test against Firebase emulator if running
  if (process.env.TEST_FIREBASE_EMULATOR === 'true') {
    console.log('\n--- 3. Verifying Firebase Hosting Emulator ETag Header ---');
    const emuBaseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5000';
    for (const feed of CORE_FEEDS) {
      const res = await fetchUrl(`${emuBaseUrl}${feed.source}`);
      assert.strictEqual(res.statusCode, 200, `Expected 200 OK from emulator for ${feed.source}`);
      assert.ok(res.headers['etag'], `Missing ETag header in emulator response for ${feed.source}`);
      console.log(`  ✓ Firebase Emulator ${feed.source} returned ETag: ${res.headers['etag']}`);
    }
  }

  console.log('\n✅ All Core Global Feed ETag and Caching tests passed successfully!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
