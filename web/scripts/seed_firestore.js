#!/usr/bin/env node

/**
 * Seeds local Firestore Emulator with test fixtures from src/data/seed_data.json.
 * 
 * Usage:
 *   node scripts/seed_firestore.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(__dirname, '../src/data/seed_data.json');

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT_ID = process.env.GCP_PROJECT || 'max-ostapenko';

async function seed() {
  console.log(`\n🌱 Seeding Firestore Emulator (${EMULATOR_HOST}) for project: ${PROJECT_ID}...`);

  if (!fs.existsSync(SEED_FILE)) {
    console.error(`❌ Seed file not found: ${SEED_FILE}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  console.log(`📦 Loaded ${rawData.length} seed change documents.`);

  let seededCount = 0;

  for (const item of rawData) {
    const docId = item.id;
    const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/changes/${docId}`;

    // Convert JS types to Firestore REST fields
    const fields = {};
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'string') {
        fields[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          fields[key] = { integerValue: String(value) };
        } else {
          fields[key] = { doubleValue: value };
        }
      } else if (typeof value === 'boolean') {
        fields[key] = { booleanValue: value };
      } else if (Array.isArray(value)) {
        fields[key] = {
          arrayValue: {
            values: value.map((v) => ({ stringValue: String(v) })),
          },
        };
      } else if (typeof value === 'object' && value !== null) {
        // Stringify complex JSON for now
        fields[key] = { stringValue: JSON.stringify(value) };
      }
    }

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      if (res.ok) {
        console.log(`  ✓ Seeded change: ${docId} [${item.status.toUpperCase()}]`);
        seededCount++;
      } else {
        const errText = await res.text();
        console.warn(`  ⚠️ Failed to seed ${docId}: ${res.status} ${errText}`);
      }
    } catch (err) {
      console.error(`  ❌ Network error connecting to emulator on ${EMULATOR_HOST}:`, err.message);
      console.log('\nMake sure the Firestore emulator is running:');
      console.log('  npx firebase-tools emulators:start --only firestore\n');
      process.exit(1);
    }
  }

  console.log(`\n🎉 Successfully seeded ${seededCount}/${rawData.length} documents into Firestore Emulator!\n`);
}

seed();
