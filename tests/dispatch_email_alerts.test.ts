import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderBreakingEmailHtml,
  renderBreakingChangesEmailHtml,
  formatAlertSubject,
  isServiceWatched,
  isDevEnvironment,
  sendResendEmail,
  escapeHtml,
} from '../scripts/dispatch_email_alerts.ts';

describe('dispatch_email_alerts', () => {
  const sampleChange = {
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
  };

  it('renders breaking email html properly', () => {
    const html = renderBreakingEmailHtml(sampleChange);
    expect(html).toContain('Vertex AI');
    expect(html).toContain('Vertex AI: Breaking Changes &amp; Agent IAM Controls');
    expect(html).toContain(
      'https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1'
    );
    expect(html).toContain('https://google-cloud-radar.com/?action=alerts');
    expect(html).toContain('publishers.v1beta1.compact');
  });

  it('escapes special characters to prevent XSS in email template', () => {
    const maliciousChange = {
      slug: '2026-08-30-malicious',
      date: '2026-08-30',
      service: 'Malicious <script>alert(1)</script>',
      api: 'test.api & co',
      title: "Title with <img src=x onerror=alert('xss')>",
      summary: 'Summary & <b>bold</b> payloads',
      extracted_methods: ['<evil_method()>'],
      tags: ['<tag1>'],
    };

    const rendered = renderBreakingEmailHtml(maliciousChange);
    expect(rendered).not.toContain('<script>');
    expect(rendered).not.toContain('<img src=x');
    expect(rendered).not.toContain('<evil_method()>');
    expect(rendered).not.toContain('<tag1>');
    expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered).toContain('&lt;img src=x onerror=alert(&#x27;xss&#x27;)&gt;');
    expect(rendered).toContain('&lt;evil_method()&gt;');
    expect(rendered).toContain('#&lt;tag1&gt;');
  });

  it('checks is_service_watched correctly for subscribers', () => {
    // All services subscriber
    const subAll = {
      uid: 'u1',
      email: 'user@example.com',
      all_services: true,
      watched_services: [],
    };
    expect(isServiceWatched(subAll, 'vertex-ai')).toBe(true);
    expect(isServiceWatched(subAll, 'bigquery')).toBe(true);

    // Specific services subscriber
    const subSpecific = {
      uid: 'u2',
      email: 'dev@example.com',
      all_services: false,
      watched_services: ['vertex-ai', 'dataform'],
    };
    expect(isServiceWatched(subSpecific, 'vertex-ai')).toBe(true);
    expect(isServiceWatched(subSpecific, 'bigquery')).toBe(false);
  });

  describe('isDevEnvironment', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns false in production', () => {
      process.env.ENVIRONMENT = 'production';
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      expect(isDevEnvironment()).toBe(false);
    });

    it('returns false in CI', () => {
      delete process.env.ENVIRONMENT;
      process.env.CI = 'true';
      expect(isDevEnvironment()).toBe(false);
    });

    it('returns true in local dev', () => {
      delete process.env.ENVIRONMENT;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      expect(isDevEnvironment()).toBe(true);
    });
  });

  it('sends email successfully via Resend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'msg_12345' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const success = await sendResendEmail({
      apiKey: 're_test_key',
      fromEmail: 'Google Cloud Radar <alerts@google-cloud-radar.com>',
      toEmail: 'test@example.com',
      subject: 'Test Subject',
      htmlContent: '<p>Test</p>',
    });

    expect(success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  describe('formatAlertSubject', () => {
    it('formats subject for single change', () => {
      const subject = formatAlertSubject([sampleChange]);
      expect(subject).toBe(
        '⚠️ [Breaking Alert] Vertex AI: Vertex AI: Breaking Changes & Agent IAM Controls'
      );
    });

    it('formats subject for multiple changes from 2 services', () => {
      const change2 = {
        slug: '2026-08-30-storage-v1',
        service: 'Cloud Storage',
        title: 'Storage API v1 Updates',
      };
      const subject = formatAlertSubject([sampleChange, change2]);
      expect(subject).toBe(
        '⚠️ [Breaking Alert] 2 breaking changes detected (Vertex AI, Cloud Storage)'
      );
    });

    it('formats subject for 3+ services with overflow count', () => {
      const change2 = { service: 'Cloud Storage', title: 'Storage v1' };
      const change3 = { service: 'BigQuery', title: 'BigQuery v2' };
      const subject = formatAlertSubject([sampleChange, change2, change3]);
      expect(subject).toBe(
        '⚠️ [Breaking Alert] 3 breaking changes detected (Vertex AI, Cloud Storage +1 more)'
      );
    });
  });

  describe('renderBreakingChangesEmailHtml', () => {
    it('returns empty string for empty changes array', () => {
      expect(renderBreakingChangesEmailHtml([])).toBe('');
    });

    it('renders single change identical to renderBreakingEmailHtml', () => {
      const html1 = renderBreakingChangesEmailHtml([sampleChange]);
      const html2 = renderBreakingEmailHtml(sampleChange);
      expect(html1).toBe(html2);
      expect(html1).toContain('⚠️ Breaking Alert');
      expect(html1).toContain('Vertex AI');
      expect(html1).not.toContain('We detected <strong>');
    });

    it('renders multiple breaking changes with combined header and multiple cards', () => {
      const change2 = {
        slug: '2026-08-30-storage-v1',
        date: '2026-08-30',
        service: 'Cloud Storage',
        api: 'storage.v1',
        title: 'Cloud Storage: Bucket Policy Enforcements',
        summary: 'Enforces strict bucket policy controls.',
        extracted_methods: ['buckets.setIamPolicy'],
        tags: ['storage', 'iam'],
      };

      const html = renderBreakingChangesEmailHtml([sampleChange, change2]);
      expect(html).toContain('⚠️ 2 Breaking Alerts');
      expect(html).toContain('We detected <strong>2 breaking changes</strong>');
      expect(html).toContain('Vertex AI');
      expect(html).toContain('Cloud Storage');
      expect(html).toContain('https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1');
      expect(html).toContain('https://google-cloud-radar.com/changes/2026-08-30-storage-v1');
      expect(html).toContain('publishers.v1beta1.compact');
      expect(html).toContain('buckets.setIamPolicy');
    });
  });
});

