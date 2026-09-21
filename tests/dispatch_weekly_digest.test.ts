import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  renderWeeklyDigestHtml,
  filterChangesForSubscriber,
  loadRecentChanges,
} from '../scripts/dispatch_weekly_digest.ts';
import { sendResendEmail } from '../scripts/dispatch_email_alerts.ts';

describe('dispatch_weekly_digest', () => {
  const sampleChanges = [
    {
      slug: '2026-08-30-aiplatform-v1beta1',
      date: '2026-08-30',
      service: 'Vertex AI',
      api: 'aiplatform.v1beta1',
      title: 'Vertex AI: Breaking Changes & Agent IAM Controls',
      summary: 'Mandatory resource parameters added and deprecated methods removed.',
      impact: 'high',
      breaking: true,
      extracted_methods: ['publishers.v1beta1.compact'],
      lead_time_days: 14,
      breaking_reasons: ["Removed method 'transcribe'"],
    },
    {
      slug: '2026-08-28-bigquery-v2',
      date: '2026-08-28',
      service: 'BigQuery',
      api: 'bigquery.v2',
      title: 'BigQuery adds fine-grained reservation parameters',
      summary: 'Added scaling metrics to reservation configs.',
      impact: 'medium',
      breaking: false,
      extracted_methods: ['jobs.query.stats'],
    },
  ];

  it('renders weekly digest html correctly', () => {
    const html = renderWeeklyDigestHtml(sampleChanges, 'Week of August 31, 2026');
    expect(html).toContain('Google Cloud');
    expect(html).toContain('Week of August 31, 2026');
    expect(html).toContain('Breaking Changes (1)');
    expect(html).toContain('New Features &amp; Schema Updates (1)');
    expect(html).toContain('Vertex AI');
    expect(html).toContain('BigQuery');
    expect(html).toContain(
      'https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1'
    );
    expect(html).toContain('https://google-cloud-radar.com/?action=alerts');
  });

  it('filters changes for subscriber based on service preferences', () => {
    // Subscriber with all_services = true
    const subAll = { all_services: true, watched_services: [] };
    const matchedAll = filterChangesForSubscriber(sampleChanges, subAll);
    expect(matchedAll.length).toBe(2);

    // Subscriber targeting only vertex-ai
    const subVertex = { all_services: false, watched_services: ['vertex-ai'] };
    const matchedVertex = filterChangesForSubscriber(sampleChanges, subVertex);
    expect(matchedVertex.length).toBe(1);
    expect(matchedVertex[0].service).toBe('Vertex AI');

    // Subscriber targeting unrelated service
    const subNone = { all_services: false, watched_services: ['non-existent-service'] };
    const matchedNone = filterChangesForSubscriber(sampleChanges, subNone);
    expect(matchedNone.length).toBe(0);
  });

  it('sends email successfully via sendResendEmail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'digest_msg_12345' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const success = await sendResendEmail({
      apiKey: 're_test_key',
      fromEmail: 'Google Cloud Radar <alerts@google-cloud-radar.com>',
      toEmail: 'test@example.com',
      subject: 'Weekly Digest',
      htmlContent: '<p>Weekly Updates</p>',
    });

    expect(success).toBe(true);
    fetchSpy.mockRestore();
  });

  it('loads recent changes strictly within the specified days window', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-digest-test-'));
    try {
      const today = new Date();
      const recentDate = new Date(today);
      recentDate.setDate(today.getDate() - 2);
      const oldDate = new Date(today);
      oldDate.setDate(today.getDate() - 20);

      fs.writeFileSync(
        path.join(tmpDir, '2026-08-30-recent.json'),
        JSON.stringify({ slug: 'recent', date: recentDate.toISOString().slice(0, 10) })
      );
      fs.writeFileSync(
        path.join(tmpDir, '2026-08-10-old.json'),
        JSON.stringify({ slug: 'old', date: oldDate.toISOString().slice(0, 10) })
      );

      const changes = loadRecentChanges(7, tmpDir);
      expect(changes.length).toBe(1);
      expect(changes[0].slug).toBe('recent');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty array when all changes are older than window', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-digest-test-'));
    try {
      const today = new Date();
      const oldDate = new Date(today);
      oldDate.setDate(today.getDate() - 30);

      fs.writeFileSync(
        path.join(tmpDir, '2026-08-01-old.json'),
        JSON.stringify({ slug: 'old', date: oldDate.toISOString().slice(0, 10) })
      );

      const changes = loadRecentChanges(7, tmpDir);
      expect(changes.length).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
