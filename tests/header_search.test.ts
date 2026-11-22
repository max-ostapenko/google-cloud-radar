import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function extractInlineSearchScript(source: string): string {
  const marker = 'function setupHeaderSearch()';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('setupHeaderSearch not found in Header.astro');
  const end = source.indexOf('</script>', start);
  if (end === -1) throw new Error('Closing </script> not found after setupHeaderSearch');
  return source.slice(start, end);
}

function setupHeaderRuntime(pathname: string, search: string, inputValue: string) {
  const headerSource = fs.readFileSync(
    path.resolve(REPO_ROOT, 'web/src/components/Header.astro'),
    'utf-8'
  );
  const scriptBody = extractInlineSearchScript(headerSource);

  let defaultPrevented = false;
  let targetHref: string | null = null;
  const submitListeners: Array<(e: any) => void> = [];

  const searchInput = {
    value: inputValue,
    focus: () => {},
    blur: () => {},
  };

  const searchForm = {
    addEventListener: (event: string, handler: (e: any) => void) => {
      if (event === 'submit') submitListeners.push(handler);
    },
    submit: () => {
      const e = {
        preventDefault: () => {
          defaultPrevented = true;
        },
      };
      for (const listener of submitListeners) listener(e);
    },
  };

  const headerEl = {
    dataset: {} as Record<string, string>,
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
  };

  const mockWindow: any = {
    innerWidth: 1280,
    location: {
      pathname,
      search,
      set href(val: string) {
        targetHref = val;
      },
      get href() {
        return targetHref || `${pathname}${search}`;
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const mockDocument: any = {
    activeElement: null,
    querySelector: (sel: string) => (sel === '.gcp-header' ? headerEl : null),
    getElementById: (id: string) => {
      if (id === 'global-search-form') return searchForm;
      if (id === 'global-search-input') return searchInput;
      return null;
    },
    addEventListener: () => {},
  };

  const fn = new Function('window', 'document', scriptBody);
  fn(mockWindow, mockDocument);

  return {
    searchForm,
    searchInput,
    isDefaultPrevented: () => defaultPrevented,
    getTargetHref: () => targetHref,
  };
}

describe('Header Cross-Page Search Form', () => {
  it('preserves existing active filter parameters (timeline & impact) when submitting search on a non-home page', () => {
    const env = setupHeaderRuntime('/stats', '?timeline=60d&impact=breaking', 'vertex');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?timeline=60d&impact=breaking&q=vertex');
  });

  it('preserves legacy "filter" parameter when submitting search on a non-home page', () => {
    const env = setupHeaderRuntime('/services/bigquery', '?filter=high-impact&timeline=30d', 'dataset');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?filter=high-impact&timeline=30d&q=dataset');
  });

  it('removes q parameter while preserving active filters when submitting empty search query on a non-home page', () => {
    const env = setupHeaderRuntime('/stats', '?timeline=90d&impact=breaking&q=oldquery', '   ');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?timeline=90d&impact=breaking');
  });

  it('navigates to /?q=term when no prior parameters exist on non-home page', () => {
    const env = setupHeaderRuntime('/stats', '', 'compute');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?q=compute');
  });

  it('navigates to / when submitting empty query on a non-home page without existing parameters', () => {
    const env = setupHeaderRuntime('/stats', '', '   ');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/');
  });

  it('prevents default form submission on home page without navigating away', () => {
    const env = setupHeaderRuntime('/', '?timeline=30d', 'vertex');
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBeNull();
  });

  it('populates search input from URL parameter q on page load if input is initially empty', () => {
    const env = setupHeaderRuntime('/stats', '?q=prefilled_search', '');

    expect(env.searchInput.value).toBe('prefilled_search');
  });

  it('Sidebar.astro also preserves active URL search parameters on cross-page Enter', () => {
    const sidebarSource = fs.readFileSync(
      path.resolve(REPO_ROOT, 'web/src/components/Sidebar.astro'),
      'utf-8'
    );
    expect(sidebarSource).toContain('new URLSearchParams(window.location.search)');
    expect(sidebarSource).toContain("params.set('q', q)");
    expect(sidebarSource).toContain("params.delete('q')");
  });
});
