import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  MAX_REDDIT_SUBMIT_URL_LENGTH,
  REDDIT_MAX_TITLE_CHARS,
  buildBoundedRedditSubmitBody,
  buildFullRedditBody,
  buildRedditPostTitle,
  buildRedditSubmitTitle,
  buildRedditSubmitUrl,
  type SharePayload,
} from '../web/src/lib/share.ts';

function makePayload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    slug: '2026-11-20-aiplatform-v1',
    title: 'Vertex AI Agents: Anomaly Detection & Read-Only Properties',
    service: 'Vertex AI',
    api: 'aiplatform.v1',
    summary:
      'Introduces agent anomaly detection scopes and read-only metadata properties ahead of general availability.',
    methods: [
      'projects.locations.agentanomalydetectionscopes.create',
      'projects.locations.agentanomalydetectionscopes.delete',
      'projects.locations.agentanomalydetectionscopes.get',
    ],
    isBreaking: false,
    ...overrides,
  };
}

describe('ShareScoopModal Reddit submit URL bounds', () => {
  it('preserves short summaries under character limits without truncation or trailing ellipsis', () => {
    const shortSummary = 'Adds batch query execution support to BigQuery jobs.';
    const payload = makePayload({
      service: 'BigQuery',
      api: 'bigquery.v2',
      slug: '2026-11-10-bigquery-v2',
      title: 'Batch Query Execution',
      summary: shortSummary,
      methods: ['jobs.query'],
    });

    const body = buildBoundedRedditSubmitBody(payload);
    expect(body).toContain(`**Summary:**\n${shortSummary}\n\n`);
    expect(body).not.toContain('…');
    expect(body).not.toContain('...');
  });

  it('omits the Methods Updated section and avoids dangling headers when methods are empty or undefined', () => {
    for (const methods of [[], undefined]) {
      const payload = makePayload({
        summary: 'Minor schema description updates.',
        methods,
      });

      const body = buildBoundedRedditSubmitBody(payload);
      expect(body).not.toContain('Methods Updated');
      expect(body).not.toContain('- `');
      expect(body).not.toContain('\n\n\n');
      expect(body).toContain(
        '**Summary:**\nMinor schema description updates.\n\nTracked live on Google Cloud Radar:\nhttps://google-cloud-radar.com/changes/2026-11-20-aiplatform-v1'
      );
    }
  });

  it('caps displayed methods to 3 items and appends a +N more methods count indicator', () => {
    const methods = [
      'projects.locations.agents.create',
      'projects.locations.agents.delete',
      'projects.locations.agents.get',
      'projects.locations.agents.list',
      'projects.locations.agents.patch',
      'projects.locations.agents.search',
    ];
    const payload = makePayload({
      title: 'Agent Lifecycle RPCs',
      summary: 'New agent management methods added.',
      methods,
    });

    const submitBody = buildBoundedRedditSubmitBody(payload);
    expect(submitBody).toContain('- `projects.locations.agents.create`');
    expect(submitBody).toContain('- `projects.locations.agents.delete`');
    expect(submitBody).toContain('- `projects.locations.agents.get`');
    expect(submitBody).not.toContain('projects.locations.agents.list');
    expect(submitBody).toContain('- +3 more methods');

    // Singular grammar check when 4 methods are present (+1 more method)
    const fourMethodBody = buildBoundedRedditSubmitBody(
      makePayload({
        title: 'Agent Lifecycle RPCs',
        summary: 'New agent management methods added.',
        methods: methods.slice(0, 4),
      })
    );
    expect(fourMethodBody).toContain('- +1 more method');
    expect(fourMethodBody).not.toContain('+1 more methods');
  });

  it('decouples full copyable markdown body from bounded submit intent body', () => {
    const longSummary =
      'This is an extensive architectural summary detailing breaking discovery document modifications across multiple nested resource collections, pagination tokens, IAM bindings, and regional endpoint configurations. '.repeat(
        4
      );
    const methods = Array.from(
      { length: 25 },
      (_, idx) => `projects.locations.collections.engines.operations.method${idx + 1}`
    );
    const payload = makePayload({
      summary: longSummary,
      methods,
      isBreaking: true,
    });

    const fullBody = buildFullRedditBody(payload);
    const boundedBody = buildBoundedRedditSubmitBody(payload);

    // Full body retains complete summary and every method for manual "Copy All"
    expect(fullBody).toContain(longSummary);
    for (const m of methods) {
      expect(fullBody).toContain(`- \`${m}\``);
    }

    // Bounded submit body truncates summary and caps method list while keeping URL < 1,000 chars
    expect(boundedBody.length).toBeLessThan(fullBody.length);
    expect(boundedBody).toContain('…');
    expect(boundedBody).not.toContain('method25');

    const title = buildRedditSubmitTitle(payload);
    const url = buildRedditSubmitUrl(title, boundedBody);
    expect(url.length).toBeLessThan(MAX_REDDIT_SUBMIT_URL_LENGTH);
  });

  it('keeps submit URLs strictly under 1,000 characters for huge summaries, 100+ long methods, and heavy URL encoding', () => {
    const hugeSummary =
      'Breaking change affecting `v1beta1` endpoints & query params (?filter=a&pageSize=100#section) with UTF-8 symbols 🚀⚡ — '.repeat(
        30
      );
    const manyLongMethods = Array.from(
      { length: 175 },
      (_, i) =>
        `aiplatform.projects.locations.reasoningEngines.memories.revisions.subcollection${i}.rollback`
    );
    const payload = makePayload({
      slug: '2026-11-13-aiplatform-v1beta1',
      service: 'Vertex AI',
      api: 'aiplatform.v1beta1',
      summary: hugeSummary,
      methods: manyLongMethods,
      isBreaking: true,
    });

    const submitTitle = buildRedditSubmitTitle(payload);
    const submitBody = buildBoundedRedditSubmitBody(payload);
    const submitUrl = buildRedditSubmitUrl(submitTitle, submitBody);

    expect(submitUrl.length).toBeLessThan(MAX_REDDIT_SUBMIT_URL_LENGTH);
    expect(submitBody).toContain('https://google-cloud-radar.com/changes/2026-11-13-aiplatform-v1beta1');
  });

  it("preserves long post titles near Reddit's 300-character limit without overflowing the 1,000-character URL limit", () => {
    // Prefix: "[Google Cloud Radar] Vertex AI: " (32 chars) + suffix " [Breaking Change]" (18 chars) = 50 chars
    // A 248-char data.title yields a 298-character Reddit post title (right under Reddit's 300-char limit).
    const innerTitle = 'A'.repeat(120) + ' — Regional Endpoint & Schema Breaking Update ' + 'B'.repeat(82);
    expect(innerTitle.length).toBe(248);

    const payload = makePayload({
      title: innerTitle,
      summary:
        'Detailed summary of breaking API changes across regional endpoints, streaming RPCs, and IAM policy bindings that exceeds standard preview thresholds. '.repeat(
          3
        ),
      methods: [
        'projects.locations.collections.engines.assistants.agents.toolcalls.operations.get',
        'projects.locations.collections.engines.collaborativeprojects.knowledgespaces.operations.get',
        'projects.locations.knowledgespaces.operations.get',
        'projects.locations.knowledgespaces.operations.list',
        'projects.locations.knowledgespaces.operations.cancel',
      ],
      isBreaking: true,
    });

    const rawTitle = buildRedditPostTitle(payload);
    const submitTitle = buildRedditSubmitTitle(payload);
    expect(rawTitle.length).toBe(298);
    expect(rawTitle.length).toBeLessThanOrEqual(REDDIT_MAX_TITLE_CHARS);
    // Title near 300 chars is preserved verbatim without truncation
    expect(submitTitle).toBe(rawTitle);
    expect(submitTitle).not.toContain('…');

    const submitBody = buildBoundedRedditSubmitBody(payload);
    const submitUrl = buildRedditSubmitUrl(submitTitle, submitBody);

    expect(submitUrl.length).toBeLessThan(MAX_REDDIT_SUBMIT_URL_LENGTH);
    const parsedUrl = new URL(submitUrl);
    expect(parsedUrl.searchParams.get('title')).toBe(rawTitle);
    expect(submitBody).toContain('https://google-cloud-radar.com/changes/2026-11-20-aiplatform-v1');
  });

  it('caps extreme titles exceeding 300 characters while keeping total submit URL under 1,000 characters', () => {
    const extremePayload = makePayload({
      title: 'Extreme Title Segment '.repeat(25),
      summary: 'Summary text '.repeat(50),
      methods: Array.from({ length: 20 }, (_, i) => `projects.locations.services.method${i}`),
      isBreaking: true,
    });

    const submitTitle = buildRedditSubmitTitle(extremePayload);
    expect(submitTitle.length).toBeLessThanOrEqual(REDDIT_MAX_TITLE_CHARS);

    const submitBody = buildBoundedRedditSubmitBody(extremePayload);
    const submitUrl = buildRedditSubmitUrl(submitTitle, submitBody);
    expect(submitUrl.length).toBeLessThan(MAX_REDDIT_SUBMIT_URL_LENGTH);
  });

  it('keeps generated Reddit submit URLs under 1,000 characters across all real feed entries in data/changes', () => {
    const changesDir = path.resolve(process.cwd(), 'data/changes');
    const files = fs.readdirSync(changesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(changesDir, file), 'utf8'));
      const slug = file.replace(/\.json$/, '');
      const payload: SharePayload = {
        slug,
        title: raw.title || '',
        service: raw.service || '',
        api: raw.api || '',
        summary: raw.summary || '',
        methods: raw.extracted_methods || [],
        isBreaking: Boolean(raw.breaking),
      };

      const submitTitle = buildRedditSubmitTitle(payload);
      const submitBody = buildBoundedRedditSubmitBody(payload);
      const submitUrl = buildRedditSubmitUrl(submitTitle, submitBody);

      expect(
        submitUrl.length,
        `Expected Reddit submit URL for ${file} to be < 1000 chars, got ${submitUrl.length}`
      ).toBeLessThan(MAX_REDDIT_SUBMIT_URL_LENGTH);
      expect(submitBody).toContain(`https://google-cloud-radar.com/changes/${slug}`);
    }
  });
});
