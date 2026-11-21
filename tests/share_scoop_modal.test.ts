import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';

interface MockElement {
  id: string;
  value: string;
  textContent: string;
  href: string;
  innerHTML: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  classList: {
    classes: Set<string>;
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  addEventListener: (type: string, handler: (...args: any[]) => any) => void;
  click: () => Promise<void>;
  querySelectorAll: (sel: string) => MockElement[];
  querySelector: (sel: string) => MockElement | null;
}

function createMockElement(id: string, initialInnerHTML = ''): MockElement {
  const listeners = new Map<string, Array<(...args: any[]) => any>>();
  const classes = new Set<string>();
  const attributes: Record<string, string> = {};

  return {
    id,
    value: '',
    textContent: '',
    href: '#',
    innerHTML: initialInnerHTML,
    style: { display: 'none' },
    attributes,
    classList: {
      classes,
      add: (cls: string) => {
        classes.add(cls);
      },
      remove: (cls: string) => {
        classes.delete(cls);
      },
      contains: (cls: string) => classes.has(cls),
    },
    setAttribute: (k: string, v: string) => {
      attributes[k] = v;
    },
    getAttribute: (k: string) => attributes[k] ?? null,
    addEventListener: (type: string, handler: (...args: any[]) => any) => {
      const arr = listeners.get(type) || [];
      arr.push(handler);
      listeners.set(type, arr);
    },
    click: async () => {
      for (const handler of listeners.get('click') || []) {
        await handler({ target: null, preventDefault: () => {}, stopPropagation: () => {} });
      }
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function mountShareScoopModal() {
  const astroPath = path.resolve(process.cwd(), 'web/src/components/ShareScoopModal.astro');
  const source = fs.readFileSync(astroPath, 'utf-8');
  const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find <script> block in ShareScoopModal.astro');
  }

  const transpiled = stripTypeScriptTypes(scriptMatch[1]);

  const ids = [
    'globalShareModalBackdrop',
    'globalShareModalCloseBtn',
    'shareTwitterTextarea',
    'shareTwitterCount',
    'shareTwitterIntentBtn',
    'shareLinkedInTextarea',
    'shareLinkedInCount',
    'shareLinkedInIntentBtn',
    'shareSlackTextarea',
    'shareRedditTitleInput',
    'shareRedditBodyTextarea',
    'shareRedditIntentBtn',
    'shareAgentTextarea',
    'shareAgentCount',
    'shareTwitterCopyBtn',
    'shareLinkedInCopyBtn',
    'shareSlackCopyBtn',
    'shareRedditCopyBtn',
    'shareAgentCopyBtn',
  ];

  const elements = new Map<string, MockElement>();
  for (const id of ids) {
    elements.set(id, createMockElement(id, '<span>Copy</span>'));
  }

  const windowListeners = new Map<string, Array<(e: any) => void>>();
  const docListeners = new Map<string, Array<(e: any) => void>>();
  const copiedTexts: string[] = [];

  const mockDocument = {
    getElementById: (id: string) => elements.get(id) ?? null,
    addEventListener: (type: string, handler: (e: any) => void) => {
      const arr = docListeners.get(type) || [];
      arr.push(handler);
      docListeners.set(type, arr);
    },
  };

  const mockWindow = {
    addEventListener: (type: string, handler: (e: any) => void) => {
      const arr = windowListeners.get(type) || [];
      arr.push(handler);
      windowListeners.set(type, arr);
    },
    dispatchOpenShareModal: (detail: Record<string, any>) => {
      for (const handler of windowListeners.get('open_share_modal') || []) {
        handler({ detail });
      }
    },
  };

  const mockNavigator = {
    clipboard: {
      writeText: async (text: string) => {
        copiedTexts.push(text);
      },
    },
  };

  const runner = new Function('document', 'window', 'navigator', transpiled);
  runner(mockDocument, mockWindow, mockNavigator);

  return { elements, mockWindow, copiedTexts };
}

describe('ShareScoopModal Reddit link submission intent', () => {
  it('constructs standard Reddit link submission URL without embedding post body in query string', async () => {
    const { elements, mockWindow, copiedTexts } = mountShareScoopModal();

    const longSummary =
      'Added new agentic memory bank endpoints, streaming reasoning trace fields, and strict read-only lifecycle constraints across regional ReasoningEngine resources. '.repeat(
        10,
      );
    const manyMethods = Array.from(
      { length: 30 },
      (_, idx) => `projects.locations.reasoningEngines.memories.operation${idx + 1}`,
    );

    mockWindow.dispatchOpenShareModal({
      slug: '2026-11-20-aiplatform-v1beta1',
      title: 'Memory Banks, Agent Search, and Task Steering',
      service: 'Vertex AI',
      api: 'aiplatform.v1beta1',
      summary: longSummary,
      methods: manyMethods,
      isBreaking: true,
    });

    const redditTitle = elements.get('shareRedditTitleInput')!;
    const redditBody = elements.get('shareRedditBodyTextarea')!;
    const redditIntent = elements.get('shareRedditIntentBtn')!;
    const redditCopyBtn = elements.get('shareRedditCopyBtn')!;

    const expectedPermalink = 'https://google-cloud-radar.com/changes/2026-11-20-aiplatform-v1beta1';
    const expectedTitle =
      '[Google Cloud Radar] Vertex AI: Memory Banks, Agent Search, and Task Steering [Breaking Change]';

    const parsed = new URL(redditIntent.href);
    expect(parsed.origin + parsed.pathname).toBe('https://www.reddit.com/r/googlecloud/submit');
    expect(parsed.searchParams.get('url')).toBe(expectedPermalink);
    expect(parsed.searchParams.get('title')).toBe(expectedTitle);
    expect(parsed.searchParams.has('text')).toBe(false);

    // Prefilled parameters stay compact (< 200 chars each), avoiding HTTP 414 URI Too Long errors
    expect(parsed.searchParams.get('url')!.length).toBeLessThan(200);
    expect(parsed.searchParams.get('title')!.length).toBeLessThan(200);
    expect(redditIntent.href.length).toBeLessThan(500);

    // Full Markdown body remains available in the modal textarea and clipboard copy action
    expect(redditTitle.value).toBe(expectedTitle);
    expect(redditBody.value.length).toBeGreaterThan(2500);
    expect(redditBody.value).toContain(longSummary);
    expect(redditBody.value).toContain('projects.locations.reasoningEngines.memories.operation30');
    expect(redditBody.value).toContain(expectedPermalink);

    await redditCopyBtn.click();
    expect(copiedTexts).toHaveLength(1);
    expect(copiedTexts[0]).toBe(`${expectedTitle}\n\n${redditBody.value}`);

    // Verify other share tabs remain untouched
    expect(elements.get('shareTwitterIntentBtn')!.href).toContain('https://x.com/intent/post?text=');
    expect(elements.get('shareLinkedInIntentBtn')!.href).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(expectedPermalink)}`,
    );
    expect(elements.get('shareSlackTextarea')!.value).toContain(expectedPermalink);
    expect(elements.get('shareAgentTextarea')!.value).toContain(`url: ${expectedPermalink}`);
  });

  it('keeps prefilled Reddit link query parameters under 200 characters across index.json entries', () => {
    const { elements, mockWindow } = mountShareScoopModal();
    const indexPath = path.resolve(process.cwd(), 'data/index.json');
    const entries = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Array<Record<string, any>>;

    for (const entry of entries) {
      mockWindow.dispatchOpenShareModal({
        slug: entry.id,
        title: entry.title,
        service: entry.service,
        api: entry.api,
        summary: entry.summary,
        methods: entry.extracted_methods || [],
        isBreaking: Boolean(entry.breaking),
      });

      const href = elements.get('shareRedditIntentBtn')!.href;
      const parsed = new URL(href);
      expect(parsed.searchParams.has('text')).toBe(false);
      expect(parsed.searchParams.get('url')!.length).toBeLessThan(200);
      expect(parsed.searchParams.get('title')!.length).toBeLessThan(200);
    }
  });
});
