import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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

function updateFirebaseHeaders() {
  if (!fs.existsSync(firebaseJsonPath)) {
    console.error(`firebase.json not found at ${firebaseJsonPath}`);
    process.exit(1);
  }

  const firebaseJsonRaw = fs.readFileSync(firebaseJsonPath, 'utf8');
  const firebaseJson = JSON.parse(firebaseJsonRaw);

  if (!firebaseJson.hosting) {
    firebaseJson.hosting = {};
  }
  if (!Array.isArray(firebaseJson.hosting.headers)) {
    firebaseJson.hosting.headers = [];
  }

  const etags = {};

  for (const feed of CORE_FEEDS) {
    if (!fs.existsSync(feed.distPath)) {
      console.error(`Build output file not found: ${feed.distPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(feed.distPath);
    const hash = createHash('sha256').update(content).digest('hex');
    const etag = `"${hash}"`;
    etags[feed.source] = etag;

    const feedHeaderObj = {
      source: feed.source,
      headers: [
        {
          key: 'ETag',
          value: etag,
        },
        {
          key: 'Cache-Control',
          value: 'public, max-age=300, s-maxage=600',
        },
        {
          key: 'Access-Control-Allow-Origin',
          value: '*',
        },
      ],
    };

    const existingIdx = firebaseJson.hosting.headers.findIndex(
      (rule) => rule.source === feed.source
    );

    if (existingIdx !== -1) {
      firebaseJson.hosting.headers[existingIdx] = feedHeaderObj;
    } else {
      firebaseJson.hosting.headers.unshift(feedHeaderObj);
    }

    console.log(`Generated ETag for ${feed.source}: ${etag}`);
  }

  fs.writeFileSync(
    firebaseJsonPath,
    JSON.stringify(firebaseJson, null, 2) + '\n',
    'utf8'
  );
  console.log('Successfully updated firebase.json with core feed ETags.');
}

updateFirebaseHeaders();
