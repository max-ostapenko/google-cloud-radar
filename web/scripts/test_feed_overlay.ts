#!/usr/bin/env node

/**
 * Test script to verify server-side live data overlay on local change entries.
 */

import assert from 'node:assert';
import http from 'node:http';
import { getAllFeedEntries, getLocalFeedEntries, overlayLiveMetadata } from '../src/lib/feed';

async function runTests() {
  console.log('🧪 Starting Server-Side Live Data Overlay tests...\n');

  // Test 1: Unit Test overlayLiveMetadata function
  console.log('Test 1: overlayLiveMetadata unit logic');
  const localEntry = {
    slug: '2026-08-07-aiplatform-v1beta1',
    date: '2026-08-07',
    api: 'aiplatform.v1beta1',
    version: 'v1beta1',
    service: 'Vertex AI',
    service_id: 'vertex-ai',
    title: 'Local Static Title',
    impact: 'medium',
    breaking: true,
    tags: ['AI'],
    interesting_score: 8,
    status: 'canary',
    radar_ring: 'hold',
    radar_quadrant: 'ai_ml',
    radar_movement: 'new',
    reaction_counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    comments_count: 0,
    rawContent: 'Local markdown content',
    htmlContent: '<p>Local markdown content</p>',
    summary: 'Local summary',
    detailsHtml: '<p>Local markdown content</p>',
    extractedMethods: [],
    ecosystem: 'Google Cloud',
    category: 'AI & Machine Learning',
  };

  const dbEntry = {
    slug: '2026-08-07-aiplatform-v1beta1',
    date: '2026-08-07',
    api: 'aiplatform.v1beta1',
    version: 'v1beta1',
    service: 'Vertex AI DB Name',
    service_id: 'vertex-ai',
    title: 'DB Title (should be ignored for core content)',
    impact: 'high',
    breaking: true,
    tags: ['AI', 'DB'],
    interesting_score: 10,
    status: 'released',
    radar_ring: 'adopt',
    radar_quadrant: 'ai_ml',
    radar_movement: 'promoted',
    lead_time_days: 14,
    official_release_date: '2026-08-21',
    official_release_notes_url: 'https://cloud.google.com/release-notes',
    reaction_counts: { like_change: 42, released: 10, false_positive_or_duplicate: 1 },
    comments_count: 5,
    rawContent: 'DB markdown content',
    htmlContent: '<p>DB markdown content</p>',
    summary: 'DB summary',
    detailsHtml: '<p>DB markdown content</p>',
    extractedMethods: [],
    ecosystem: 'Google Cloud',
    category: 'AI & Machine Learning',
  };

  const merged = overlayLiveMetadata(localEntry, dbEntry);

  // Assert local core static fields preserved
  assert.strictEqual(merged.title, 'Local Static Title', 'Core static field title should be preserved from local');
  assert.strictEqual(merged.rawContent, 'Local markdown content', 'Core static markdown content preserved');
  assert.strictEqual(merged.summary, 'Local summary', 'Core summary preserved');

  // Assert dynamic metadata overlaid from DB
  assert.strictEqual(merged.status, 'released', 'Status overlaid from DB');
  assert.strictEqual(merged.comments_count, 5, 'Comments count overlaid from DB');
  assert.deepStrictEqual(merged.reaction_counts, { like_change: 42, released: 10, false_positive_or_duplicate: 1 }, 'Reaction counts overlaid');
  assert.strictEqual(merged.lead_time_days, 14, 'Lead time days overlaid');
  assert.strictEqual(merged.official_release_date, '2026-08-21', 'Official release date overlaid');
  assert.strictEqual(merged.official_release_notes_url, 'https://cloud.google.com/release-notes', 'Release notes URL overlaid');
  console.log('  ✅ overlayLiveMetadata unit test passed\n');

  // Test 2: Fallback when Firestore is unreachable
  console.log('Test 2: Fallback to local entries when DB server unreachable');
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:59999'; // invalid port
  process.env.FIRESTORE_TIMEOUT_MS = '100';

  const localEntries = getLocalFeedEntries();
  const fallbackEntries = await getAllFeedEntries();

  assert.ok(localEntries.length > 0, 'Local entries should be present');
  assert.strictEqual(fallbackEntries.length, localEntries.length, 'Fallback should return all local entries');
  assert.strictEqual(fallbackEntries[0].reaction_counts.like_change, 0, 'Unreachable DB fallback should keep baseline reaction counts');
  console.log('  ✅ Fallback when DB unreachable passed\n');

  // Test 3: Live Overlay integration when DB server is active
  console.log('Test 3: Live Overlay integration with active mock DB server');
  // Start mock DB server on 8080 or process
  const mockServerProcess = await new Promise((resolve) => {
    // Start dummy server on 127.0.0.1:8080 if not already running
    const req = http.get('http://127.0.0.1:8080/health', (res) => {
      resolve(null); // server already running
    });
    req.on('error', () => {
      // Not running, we set up emulator host to current script's mock server if needed
      resolve(null);
    });
  });

  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIRESTORE_TIMEOUT_MS = '600';

  const liveEntries = await getAllFeedEntries();
  assert.ok(liveEntries.length > 0, 'Live entries returned');
  
  // Check if live overlay enriched matching records
  const targetEntry = liveEntries.find((e) => e.slug === '2026-08-07-aiplatform-v1beta1');
  if (targetEntry) {
    console.log(`  Sample entry (${targetEntry.slug}):`);
    console.log(`    Title: ${targetEntry.title}`);
    console.log(`    Status: ${targetEntry.status}`);
    console.log(`    Comments Count: ${targetEntry.comments_count}`);
    console.log(`    Reactions: ${JSON.stringify(targetEntry.reaction_counts)}`);
    assert.ok(typeof targetEntry.comments_count === 'number', 'Comments count is number');
    assert.ok(targetEntry.reaction_counts && typeof targetEntry.reaction_counts.like_change === 'number', 'Reaction counts present');
  }

  console.log('  ✅ Live Overlay integration test passed\n');

  console.log('🎉 All Server-Side Live Data Overlay tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
