import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  renderWeeklyDigestHtml,
  renderWeeklyDigestText,
  filterChangesForSubscriber,
  loadRecentChanges,
  buildWeeklyDispatchId,
  hasWeeklyDigestBeenSent,
} from '../scripts/dispatch_weekly_digest.ts';
import { buildLegacyEmailKey, sendResendEmail } from '../scripts/dispatch_email_alerts.ts';

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
    expect(html).toContain('Impacted RPC Methods:');
    expect(html).toContain('<code>publishers.v1beta1.compact</code>');
    expect(html).toMatch(/<code[^>]*>jobs\.query\.stats<\/code>/);
    expect(html).toContain(
      'https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1'
    );
    expect(html).toContain('https://google-cloud-radar.com/?action=alerts');
  });

  it('renders weekly digest plaintext fallback correctly (b60ae957)', () => {
    const text = renderWeeklyDigestText(sampleChanges, 'Week of August 31, 2026');
    expect(text).toContain('GOOGLE CLOUD RADAR — WEEKLY INTELLIGENCE DIGEST');
    expect(text).toContain('Week of August 31, 2026');
    expect(text).toContain('⚠️ BREAKING CHANGES:');
    expect(text).toContain('* [Vertex AI] Vertex AI: Breaking Changes & Agent IAM Controls');
    expect(text).toContain('Impacted RPC Methods: publishers.v1beta1.compact');
    expect(text).toContain('RECENT API ADDITIONS & EVOLUTIONS:');
    expect(text).toContain('* [BigQuery] BigQuery adds fine-grained reservation parameters');
    expect(text).toContain('Methods: jobs.query.stats');
    expect(text).toContain('https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1');
    expect(text).toContain('https://google-cloud-radar.com/?action=alerts');
  });

  it('renders callout box for breaking changes capped at 8 methods with overflow badge', () => {
    const tenMethods = Array.from({ length: 10 }, (_, i) => `method.test.rpc${i + 1}`);
    const breakingChange = [
      {
        slug: '2026-09-01-spanner-v1',
        date: '2026-09-01',
        service: 'Spanner',
        api: 'spanner.v1',
        title: 'Spanner breaking change',
        summary: 'Database fields changed.',
        impact: 'high',
        breaking: true,
        extracted_methods: tenMethods,
      },
    ];

    const html = renderWeeklyDigestHtml(breakingChange, 'Week of September 1, 2026');
    expect(html).toContain('Impacted RPC Methods:');
    expect(html).toContain('<code>method.test.rpc1</code>');
    expect(html).toContain('<code>method.test.rpc8</code>');
    expect(html).not.toContain('<code>method.test.rpc9</code>');
    expect(html).not.toContain('<code>method.test.rpc10</code>');
    expect(html).toContain('+2 more methods');

    const text = renderWeeklyDigestText(breakingChange, 'Week of September 1, 2026');
    expect(text).toContain('method.test.rpc1');
    expect(text).toContain('method.test.rpc8');
    expect(text).not.toContain('method.test.rpc9');
    expect(text).toContain('(+2 more methods)');
  });

  it('renders inline method list for non-breaking changes capped at 5 methods with overflow badge', () => {
    const sevenMethods = Array.from({ length: 7 }, (_, i) => `nonbreaking.method${i + 1}`);
    const nonBreakingChange = [
      {
        slug: '2026-09-01-compute-v1',
        date: '2026-09-01',
        service: 'Compute Engine',
        api: 'compute.v1',
        title: 'Compute Engine updates',
        summary: 'Added new VM configuration options.',
        impact: 'medium',
        breaking: false,
        extracted_methods: sevenMethods,
      },
    ];

    const html = renderWeeklyDigestHtml(nonBreakingChange, 'Week of September 1, 2026');
    expect(html).toMatch(/<code[^>]*>nonbreaking\.method1<\/code>/);
    expect(html).toMatch(/<code[^>]*>nonbreaking\.method5<\/code>/);
    expect(html).not.toContain('nonbreaking.method6');
    expect(html).not.toContain('+7 methods');
    expect(html).toContain('+2 more');

    const text = renderWeeklyDigestText(nonBreakingChange, 'Week of September 1, 2026');
    expect(text).toContain('nonbreaking.method1');
    expect(text).toContain('nonbreaking.method5');
    expect(text).not.toContain('nonbreaking.method6');
    expect(text).toContain('(+2 more)');
  });

  it('omits method list container gracefully when extracted_methods is empty or missing', () => {
    const noMethodsChanges = [
      {
        slug: '2026-09-01-storage-v1',
        date: '2026-09-01',
        service: 'Cloud Storage',
        api: 'storage.v1',
        title: 'Storage bucket policy update',
        summary: 'Updated bucket IAM documentation.',
        impact: 'low',
        breaking: true,
        extracted_methods: [],
      },
      {
        slug: '2026-09-01-pubsub-v1',
        date: '2026-09-01',
        service: 'Cloud Pub/Sub',
        api: 'pubsub.v1',
        title: 'Pub/Sub topic metrics',
        summary: 'New throughput metrics available.',
        impact: 'low',
        breaking: false,
      },
    ];

    const html = renderWeeklyDigestHtml(noMethodsChanges, 'Week of September 1, 2026');
    expect(html).not.toContain('Impacted RPC Methods:');
    expect(html).not.toContain('<code>');

    const text = renderWeeklyDigestText(noMethodsChanges, 'Week of September 1, 2026');
    expect(text).not.toContain('Impacted RPC Methods:');
    expect(text).not.toContain('Methods:');
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

  it('URL-encodes slugs and labels affected API methods accurately (76b58d9b / 13d2ba23)', () => {
    const specialChanges = [
      {
        ...sampleChanges[0],
        slug: '2026-08-30/aiplatform v1?beta=1',
      },
      {
        ...sampleChanges[1],
        slug: '2026-08-28/bigquery v2',
      },
    ];
    const html = renderWeeklyDigestHtml(specialChanges, 'test@example.com');
    const text = renderWeeklyDigestText(specialChanges);

    expect(html).toContain('https://google-cloud-radar.com/changes/2026-08-30%2Faiplatform%20v1%3Fbeta%3D1');
    expect(html).toContain('https://google-cloud-radar.com/changes/2026-08-28%2Fbigquery%20v2');
    expect(text).toContain('https://google-cloud-radar.com/changes/2026-08-30%2Faiplatform%20v1%3Fbeta%3D1');
    expect(text).toContain('https://google-cloud-radar.com/changes/2026-08-28%2Fbigquery%20v2');
    expect(html).toContain('affected API methods');
    expect(html).not.toContain('new API methods');
  });

  it('builds collision-free weekly dispatch IDs and checks legacy fallback email (6d6de126)', async () => {
    const id1 = buildWeeklyDispatchId(2026, 46, 'user.name@example.com');
    const id2 = buildWeeklyDispatchId(2026, 46, 'user_name@example.com');
    expect(id1).not.toBe(id2);

    const legacyId = `weekly_2026_w46_${buildLegacyEmailKey('user.name@example.com')}`;
    const mockFirestore: any = {
      collection: () => ({
        doc: (docId: string) => ({
          get: async () => {
            if (docId === legacyId) {
              return { exists: true, data: () => ({ recipient_email: 'user.name@example.com' }) };
            }
            return { exists: false };
          },
        }),
      }),
    };

    expect(
      await hasWeeklyDigestBeenSent(mockFirestore, id1, 'user.name@example.com', legacyId)
    ).toBe(true);
    expect(
      await hasWeeklyDigestBeenSent(mockFirestore, id2, 'user_name@example.com', legacyId)
    ).toBe(false);
  });
});
