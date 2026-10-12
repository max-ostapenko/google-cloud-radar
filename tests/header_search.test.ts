import { describe, it, expect } from 'vitest';

function setupMockEnvironment(pathname: string, search: string, inputValue: string) {
  let defaultPrevented = false;
  let targetHref: string | null = null;

  const listeners: Record<string, (e: any) => void> = {};

  const searchInput = {
    value: inputValue,
  };

  const searchForm = {
    addEventListener: (event: string, handler: (e: any) => void) => {
      listeners[event] = handler;
    },
    submit: () => {
      const e = {
        preventDefault: () => {
          defaultPrevented = true;
        },
      };
      if (listeners['submit']) {
        listeners['submit'](e);
      }
    },
  };

  const mockWindow = {
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
  };

  const mockDocument = {
    getElementById: (id: string): any => {
      if (id === 'global-search-form') return searchForm;
      if (id === 'global-search-input') return searchInput;
      return null;
    },
  };

  function setupSearchForm() {
    const form = mockDocument.getElementById('global-search-form');
    const input = mockDocument.getElementById('global-search-input');
    if (!form || !input) return;

    const currentParams = new URLSearchParams(mockWindow.location.search);
    const initialQ = currentParams.get('q');
    if (initialQ && !input.value) {
      input.value = initialQ;
    }

    form.addEventListener('submit', (e: any) => {
      e.preventDefault();
      const isHome = mockWindow.location.pathname === '/' || mockWindow.location.pathname === '';
      if (isHome) {
        return;
      }
      const q = input.value.trim();
      const params = new URLSearchParams(mockWindow.location.search);
      if (q) {
        params.set('q', q);
      } else {
        params.delete('q');
      }
      const queryString = params.toString();
      mockWindow.location.href = queryString ? `/?${queryString}` : '/';
    });
  }

  return {
    searchForm,
    searchInput,
    mockWindow,
    setupSearchForm,
    isDefaultPrevented: () => defaultPrevented,
    getTargetHref: () => targetHref,
  };
}

describe('Header Cross-Page Search Form', () => {
  it('preserves existing active filter parameters (timeline & impact) when submitting search on a non-home page', () => {
    const env = setupMockEnvironment('/stats', '?timeline=60d&impact=breaking', 'vertex');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?timeline=60d&impact=breaking&q=vertex');
  });

  it('preserves legacy "filter" parameter when submitting search on a non-home page', () => {
    const env = setupMockEnvironment('/services/bigquery', '?filter=high-impact&timeline=30d', 'dataset');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?filter=high-impact&timeline=30d&q=dataset');
  });

  it('removes q parameter while preserving active filters when submitting empty search query on a non-home page', () => {
    const env = setupMockEnvironment('/stats', '?timeline=90d&impact=breaking&q=oldquery', '   ');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?timeline=90d&impact=breaking');
  });

  it('navigates to /?q=term when no prior parameters exist on non-home page', () => {
    const env = setupMockEnvironment('/stats', '', 'compute');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/?q=compute');
  });

  it('navigates to / when submitting empty query on a non-home page without existing parameters', () => {
    const env = setupMockEnvironment('/stats', '', '   ');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBe('/');
  });

  it('prevents default form submission on home page without navigating away', () => {
    const env = setupMockEnvironment('/', '?timeline=30d', 'vertex');
    env.setupSearchForm();
    env.searchForm.submit();

    expect(env.isDefaultPrevented()).toBe(true);
    expect(env.getTargetHref()).toBeNull();
  });

  it('populates search input from URL parameter q on page load if input is initially empty', () => {
    const env = setupMockEnvironment('/stats', '?q=prefilled_search', '');
    env.setupSearchForm();

    expect(env.searchInput.value).toBe('prefilled_search');
  });
});
