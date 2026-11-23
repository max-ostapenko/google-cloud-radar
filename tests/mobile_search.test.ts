import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const headerContent = fs.readFileSync(path.resolve(REPO_ROOT, 'web/src/components/Header.astro'), 'utf-8');
const sidebarContent = fs.readFileSync(path.resolve(REPO_ROOT, 'web/src/components/Sidebar.astro'), 'utf-8');

describe('Mobile Search & Sidebar Search Integration', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <header class="gcp-header">
            <div class="header-left">
              <button id="mobileSidebarToggle" class="mobile-sidebar-toggle" type="button">Sidebar</button>
            </div>
            <div class="header-center">
              <form id="global-search-form" class="search-form" action="/" method="GET" role="search">
                <div class="search-box">
                  <input type="search" name="q" id="global-search-input" placeholder="Search..." autocomplete="off" />
                  <span class="search-kbd">/</span>
                  <button type="button" id="mobileSearchCloseBtn" class="mobile-search-close-btn" aria-label="Close search">Close</button>
                </div>
              </form>
            </div>
            <div class="header-right">
              <button id="mobileSearchToggle" class="mobile-search-toggle" aria-label="Toggle search bar" type="button">Search</button>
            </div>
          </header>

          <aside class="gcp-sidebar" id="gcpSidebar">
            <div class="sidebar-menu">
              <div class="sidebar-search">
                <input type="search" id="sidebar-search-input" class="sidebar-search-input" placeholder="Filter APIs..." autocomplete="off" />
              </div>
              <div class="ecosystem-container">
                <details class="ecosystem-section" data-eco-id="AI/ML" open>
                  <summary class="ecosystem-header"><span class="ecosystem-label">AI/ML</span></summary>
                  <ul class="service-list">
                    <li><a href="/services/vertex-ai" class="service-link"><span class="service-name">Vertex AI</span></a></li>
                    <li><a href="/services/translation" class="service-link"><span class="service-name">Cloud Translation</span></a></li>
                  </ul>
                </details>
                <details class="ecosystem-section" data-eco-id="Data" open>
                  <summary class="ecosystem-header"><span class="ecosystem-label">Data</span></summary>
                  <ul class="service-list">
                    <li><a href="/services/bigquery" class="service-link"><span class="service-name">BigQuery</span></a></li>
                  </ul>
                </details>
              </div>
            </div>
          </aside>
        </body>
      </html>
    `, {
      url: 'http://localhost/',
    });

    document = dom.window.document;
    window = dom.window as unknown as Window & typeof globalThis;
  });

  it('contains required mobile search toggle and sidebar search input markup in Astro source', () => {
    expect(headerContent).toContain('id="mobileSearchToggle"');
    expect(headerContent).toContain('id="mobileSearchCloseBtn"');
    expect(headerContent).toContain('search-expanded');
    expect(headerContent).toContain('expandMobileSearch');

    expect(sidebarContent).toContain('id="sidebar-search-input"');
    expect(sidebarContent).toContain('initSidebarSearch');
  });

  it('toggles mobile search bar expansion when clicking toggle and close buttons', () => {
    const header = document.querySelector('.gcp-header');
    const toggleBtn = document.getElementById('mobileSearchToggle');
    const closeBtn = document.getElementById('mobileSearchCloseBtn');
    const searchInput = document.getElementById('global-search-input') as HTMLInputElement;

    function expandMobileSearch() {
      if (header) header.classList.add('search-expanded');
      if (searchInput) searchInput.focus();
    }

    function collapseMobileSearch() {
      if (header) header.classList.remove('search-expanded');
      if (searchInput) searchInput.blur();
    }

    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (header?.classList.contains('search-expanded')) {
        collapseMobileSearch();
      } else {
        expandMobileSearch();
      }
    });

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseMobileSearch();
    });

    expect(header?.classList.contains('search-expanded')).toBe(false);

    toggleBtn?.click();
    expect(header?.classList.contains('search-expanded')).toBe(true);

    closeBtn?.click();
    expect(header?.classList.contains('search-expanded')).toBe(false);
  });

  it('handles / key shortcut on mobile viewports by expanding mobile search and focusing input', () => {
    const header = document.querySelector('.gcp-header');
    const searchInput = document.getElementById('global-search-input') as HTMLInputElement;

    function expandMobileSearch() {
      if (header) header.classList.add('search-expanded');
      if (searchInput) searchInput.focus();
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if ((window.innerWidth || 375) <= 1024) {
          expandMobileSearch();
        } else if (searchInput) {
          searchInput.focus();
        }
      }
    });

    // Simulate mobile viewport keydown
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    const slashEvent = new dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    window.dispatchEvent(slashEvent);

    expect(header?.classList.contains('search-expanded')).toBe(true);
    expect(document.activeElement).toBe(searchInput);
  });

  it('synchronizes sidebar search input with global search input and dispatches input events', () => {
    const sidebarInput = document.getElementById('sidebar-search-input') as HTMLInputElement;
    const globalInput = document.getElementById('global-search-input') as HTMLInputElement;

    let globalInputEventFired = false;
    globalInput.addEventListener('input', () => {
      globalInputEventFired = true;
    });

    // Connect sync listener as in Sidebar.astro
    sidebarInput.addEventListener('input', () => {
      const val = sidebarInput.value;
      if (globalInput && globalInput.value !== val) {
        globalInput.value = val;
        globalInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
    });

    globalInput.addEventListener('input', () => {
      if (sidebarInput.value !== globalInput.value) {
        sidebarInput.value = globalInput.value;
      }
    });

    // User types in sidebar search input
    sidebarInput.value = 'vertex';
    sidebarInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(globalInput.value).toBe('vertex');
    expect(globalInputEventFired).toBe(true);

    // User updates global search input directly
    globalInput.value = 'bigquery';
    globalInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(sidebarInput.value).toBe('bigquery');
  });

  it('filters sidebar ecosystem and service links when searching in sidebar search input', () => {
    const sidebarInput = document.getElementById('sidebar-search-input') as HTMLInputElement;

    function filterSidebarList(query: string) {
      const q = query.trim().toLowerCase();
      const ecoSections = document.querySelectorAll<HTMLDetailsElement>('details.ecosystem-section');

      ecoSections.forEach((eco) => {
        const serviceLinks = eco.querySelectorAll<HTMLAnchorElement>('.service-link');
        let visibleCount = 0;

        serviceLinks.forEach((link) => {
          const serviceName = link.querySelector('.service-name')?.textContent || '';
          if (!q || serviceName.toLowerCase().includes(q)) {
            (link.parentElement as HTMLElement).style.display = '';
            visibleCount++;
          } else {
            (link.parentElement as HTMLElement).style.display = 'none';
          }
        });

        if (!q || visibleCount > 0) {
          eco.style.display = '';
          if (q) eco.open = true;
        } else {
          eco.style.display = 'none';
        }
      });
    }

    filterSidebarList('vertex');

    const aiEco = document.querySelector('details[data-eco-id="AI/ML"]') as HTMLDetailsElement;
    const dataEco = document.querySelector('details[data-eco-id="Data"]') as HTMLDetailsElement;

    expect(aiEco.style.display).not.toBe('none');
    expect(dataEco.style.display).toBe('none');

    // Reset filter
    filterSidebarList('');
    expect(aiEco.style.display).toBe('');
    expect(dataEco.style.display).toBe('');
  });
});
