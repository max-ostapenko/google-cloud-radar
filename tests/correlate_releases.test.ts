import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import * as correlate_releases from '../scripts/correlate_releases.ts';
import { getReleaseFeedUrls, getReleaseFeedUrl } from '../scripts/taxonomy.ts';

const TMP_DIR = path.join(os.tmpdir(), 'radar_test_correlate');

describe('Correlate Releases', () => {
  it('calculate lead time', () => {
    const lead = correlate_releases.calculateLeadTime('2026-08-01', '2026-08-15');
    expect(lead).toBe(14);

    const leadSame = correlate_releases.calculateLeadTime('2026-08-15', '2026-08-15');
    expect(leadSame).toBe(0);

    const leadNeg = correlate_releases.calculateLeadTime('2026-08-20', '2026-08-15');
    expect(leadNeg).toBe(0);
  });

  it('parse feed xml atom', () => {
    const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Vertex AI Release Notes</title>
      <entry>
        <title>Reasoning Engine session compaction is now GA</title>
        <link href="https://cloud.google.com/vertex-ai/docs/release-notes#August_15_2026"/>
        <updated>2026-08-15T12:00:00Z</updated>
        <content type="html">You can now use session compact method to summarize reasoning engines.</content>
      </entry>
    </feed>`;

    const entries = correlate_releases.parseFeedXml(sampleAtom);
    expect(entries.length).toBe(1);
    expect(entries[0].title).toBe('Reasoning Engine session compaction is now GA');
    expect(entries[0].date).toBe('2026-08-15');
    expect(entries[0].content).toContain('compact');
  });

  it('match change against releases by rpc', () => {
    const changeMeta = {
      slug: '2026-08-01-aiplatform-v1beta1',
      title: 'Vertex AI: Session Compaction and Transcription',
      first_detected: '2026-08-01',
      extracted_methods: ['projects.locations.reasoningEngines.sessions.compact'],
    };
    const releaseEntries = [
      {
        title: 'Unrelated BigQuery update',
        url: 'https://cloud.google.com/release-notes/1',
        date: '2026-08-10',
        content: 'bigquery adds new streaming options',
      },
      {
        title: 'Vertex AI adds session compact',
        url: 'https://cloud.google.com/release-notes/2',
        date: '2026-08-15',
        content: 'developers can now compact sessions in reasoning engines',
      },
    ];

    const match = correlate_releases.matchChangeAgainstReleases(changeMeta, releaseEntries);
    expect(match).not.toBeNull();
    expect(match.date).toBe('2026-08-15');
    expect(match.url).toBe('https://cloud.google.com/release-notes/2');
  });

  it('reject past release notes', () => {
    const changeMeta = {
      slug: '2026-08-01-aiplatform-v1beta1',
      title: 'Vertex AI: Session Compaction and Transcription',
      first_detected: '2026-08-01',
      extracted_methods: ['projects.locations.reasoningEngines.sessions.compact'],
    };
    const releaseEntries = [
      {
        title: 'Vertex AI adds session compact',
        url: 'https://cloud.google.com/release-notes/old',
        date: '2025-09-10',
        content: 'developers can now compact sessions in reasoning engines',
      },
    ];

    const match = correlate_releases.matchChangeAgainstReleases(changeMeta, releaseEntries);
    expect(match).toBeNull();
  });

  it('update json file', () => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const tmpPath = path.join(TMP_DIR, 'test_change.json');

    const doc = {
      id: '2026-08-01-aiplatform-v1beta1',
      service: 'Vertex AI',
      api: 'aiplatform.v1beta1',
      title: 'Session Compaction',
      status: 'canary',
    };
    fs.writeFileSync(tmpPath, JSON.stringify(doc), 'utf-8');

    try {
      const relInfo = {
        date: '2026-08-20',
        url: 'https://cloud.google.com/release-notes#1',
      };
      const ok = correlate_releases.updateJsonFile(tmpPath, relInfo, 19);
      expect(ok).toBe(true);

      const updated = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
      expect(updated.status).toBe('released');
      expect(updated.lead_time_days).toBe(19);
      expect(updated.official_release_date).toBe('2026-08-20');
      expect(updated.official_release_notes_url).toBe('https://cloud.google.com/release-notes#1');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it('load and save release archive', () => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const tmpPath = path.join(TMP_DIR, 'archive.json');

    try {
      const data = {
        'https://feed.test/atom.xml': [
          {
            date: '2026-08-01',
            title: 'Test Note',
            url: 'https://test.com/1',
          },
        ],
      };
      correlate_releases.saveReleaseArchive(tmpPath, data);
      const loaded = correlate_releases.loadReleaseArchive(tmpPath);
      expect(loaded['https://feed.test/atom.xml']).toBeDefined();
      expect(loaded['https://feed.test/atom.xml'].length).toBe(1);
      expect(loaded['https://feed.test/atom.xml'][0].title).toBe('Test Note');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it('taxonomy multi feed urls', () => {
    const urls = getReleaseFeedUrls('aiplatform');
    expect(urls.length).toBeGreaterThanOrEqual(1);
    expect(urls.some((u: string) => u.includes('gemini-enterprise-agent-platform'))).toBe(true);

    const primary = getReleaseFeedUrl('aiplatform');
    expect(primary).not.toBeNull();
    expect(primary).toBe(urls[0]);
  });
});
