import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as taxonomy from '../scripts/taxonomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const TAXONOMY_PATH = path.resolve(REPO_ROOT, 'data/taxonomy.json');
const DISCOVERY_INDEX_PATH = path.resolve(REPO_ROOT, 'discoveries/index.json');

const taxonomyData = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf-8'));
const discoveryData = JSON.parse(fs.readFileSync(DISCOVERY_INDEX_PATH, 'utf-8'));

const ecosystemsRaw: Array<{ id: string; name: string; categories?: string[]; services?: string[] }> = taxonomyData.ecosystems || [];
const categoriesRaw: Array<{ id: string; name: string; services?: string[] }> = taxonomyData.categories || [];
const servicesRaw: Record<string, any> = taxonomyData.services || {};
const watchedServices = taxonomy.WATCHED_SERVICES;
const ecosystems = taxonomy.ECOSYSTEMS;
const categories = taxonomy.CATEGORIES;

const discoveryByName: Record<string, any[]> = {};
for (const item of discoveryData.items || []) {
  if (item.name) {
    if (!discoveryByName[item.name]) discoveryByName[item.name] = [];
    discoveryByName[item.name].push(item);
  }
}

describe('Taxonomy', () => {
  it('hierarchical schema integrity', () => {
    expect(Array.isArray(ecosystemsRaw)).toBe(true);
    expect(ecosystemsRaw.length).toBeGreaterThan(0);
    const ecoIds = new Set<string>();
    const referencedCatIds = new Set<string>();
    const directServiceIds = new Set<string>();

    for (const eco of ecosystemsRaw) {
      expect(eco.id).toBeDefined();
      expect(eco.name).toBeDefined();
      expect(ecoIds.has(eco.id)).toBe(false);
      ecoIds.add(eco.id);

      const cats = eco.categories || [];
      const directSvcs = eco.services || [];
      expect(cats.length > 0 || directSvcs.length > 0).toBe(true);

      for (const catId of cats) {
        expect(referencedCatIds.has(catId)).toBe(false);
        referencedCatIds.add(catId);
      }

      for (const svcId of directSvcs) {
        expect(directServiceIds.has(svcId)).toBe(false);
        directServiceIds.add(svcId);
      }
    }

    expect(Array.isArray(categoriesRaw)).toBe(true);
    expect(categoriesRaw.length).toBeGreaterThan(0);
    const catIds = new Set<string>();
    const categorizedServiceIds = new Set<string>();

    for (const cat of categoriesRaw) {
      expect(cat.id).toBeDefined();
      expect(cat.name).toBeDefined();
      expect(Array.isArray(cat.services)).toBe(true);
      const services = cat.services || [];
      expect(services.length).toBeGreaterThanOrEqual(2);
      expect(catIds.has(cat.id)).toBe(false);
      catIds.add(cat.id);

      expect(referencedCatIds.has(cat.id)).toBe(true);

      for (const svcId of services) {
        expect(categorizedServiceIds.has(svcId)).toBe(false);
        expect(directServiceIds.has(svcId)).toBe(false);
        categorizedServiceIds.add(svcId);
      }
    }

    expect(typeof servicesRaw).toBe('object');
    const allAssignedServices = new Set([...categorizedServiceIds, ...directServiceIds]);

    for (const svcId of Object.keys(servicesRaw)) {
      expect(allAssignedServices.has(svcId)).toBe(true);
    }

    for (const svcId of allAssignedServices) {
      expect(servicesRaw[svcId]).toBeDefined();
    }
  });

  it('no orphaned records and single hierarchical link', () => {
    const catById = Object.fromEntries(categoriesRaw.map((c) => [c.id, c]));
    const referencedCatsInEcos = new Set<string>();

    for (const eco of ecosystemsRaw) {
      for (const catId of eco.categories || []) {
        expect(catById[catId]).toBeDefined();
        referencedCatsInEcos.add(catId);
      }
    }

    for (const catId of Object.keys(catById)) {
      expect(referencedCatsInEcos.has(catId)).toBe(true);
      const cat = catById[catId];
      expect(cat).toBeDefined();
      expect((cat?.services || []).length).toBeGreaterThanOrEqual(2);
    }

    for (const cat of categoriesRaw) {
      for (const svcId of cat.services || []) {
        expect(servicesRaw[svcId]).toBeDefined();
      }
    }

    for (const eco of ecosystemsRaw) {
      for (const svcId of eco.services || []) {
        expect(servicesRaw[svcId]).toBeDefined();
      }
    }

    const serviceCategoryLinks: Record<string, string[]> = Object.fromEntries(Object.keys(servicesRaw).map((k) => [k, []]));
    const serviceEcosystemLinks: Record<string, string[]> = Object.fromEntries(Object.keys(servicesRaw).map((k) => [k, []]));

    for (const cat of categoriesRaw) {
      for (const svcId of cat.services || []) {
        serviceCategoryLinks[svcId]?.push(cat.id);
      }
    }

    for (const eco of ecosystemsRaw) {
      for (const svcId of eco.services || []) {
        serviceEcosystemLinks[svcId]?.push(eco.id);
      }
    }

    for (const svcId of Object.keys(servicesRaw)) {
      const catLinks = serviceCategoryLinks[svcId] || [];
      const ecoLinks = serviceEcosystemLinks[svcId] || [];
      const totalLinks = catLinks.length + ecoLinks.length;
      expect(totalLinks).toBe(1);
    }

    const categoryEcoLinks: Record<string, string[]> = Object.fromEntries(Object.keys(catById).map((k) => [k, []]));
    for (const eco of ecosystemsRaw) {
      for (const catId of eco.categories || []) {
        categoryEcoLinks[catId]?.push(eco.id);
      }
    }

    for (const [catId, parents] of Object.entries(categoryEcoLinks)) {
      expect(parents.length).toBe(1);
    }
  });

  it('all watched services exist in discovery index', () => {
    expect(Object.keys(watchedServices).length).toBeGreaterThan(0);

    for (const apiName of Object.keys(servicesRaw)) {
      expect(discoveryByName[apiName]).toBeDefined();
      expect(taxonomy.isWatchedApi(apiName)).toBe(true);
      expect(taxonomy.isWatchedApi(apiName.toUpperCase())).toBe(true);
      expect(taxonomy.isWatchedApi(`${apiName}.v1`)).toBe(true);
      expect(taxonomy.isWatchedApi(`${apiName}:v1`)).toBe(true);
    }

    expect(taxonomy.isWatchedApi('non_existent_fake_api')).toBe(false);
  });

  it('watched services fields match discovery metadata', () => {
    for (const [apiName, meta] of Object.entries(watchedServices)) {
      const discoveryItems = discoveryByName[apiName] || [];
      expect(discoveryItems.length).toBeGreaterThan(0);

      for (const discoItem of discoveryItems) {
        expect(discoItem.name).toBe(apiName);
        expect(discoItem.version).toBeDefined();
        expect(discoItem.title).toBeDefined();
        expect(discoItem.discoveryRestUrl?.startsWith('https://')).toBe(true);
      }

      expect(meta.name).toBeDefined();
      expect(ecosystems.includes(meta.ecosystem)).toBe(true);
      if (meta.category) {
        expect(categories.includes(meta.category)).toBe(true);
      }

      for (const url of taxonomy.getReleaseFeedUrls(apiName)) {
        expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true);
      }

      for (const alias of meta.aliases || []) {
        const resolved = taxonomy.findServiceMeta(alias);
        expect(resolved).toBeDefined();
        expect(resolved?.name).toBe(meta.name);
      }
    }
  });

  it('canonical AI services grouping', () => {
    const aiServices = Object.entries(watchedServices).filter(([, meta]) => meta.ecosystem === 'AI/ML');
    const canonicalNames = new Set(aiServices.map(([, meta]) => meta.name));
    expect(canonicalNames).toEqual(new Set(['Vertex AI', 'Vertex AI Agent Builder']));

    const aiplatformQueries = [
      'aiplatform',
      'aiplatform.v1',
      'aiplatform.v1beta1',
      'aiplatform:v1',
      'Vertex AI',
      'Agent Platform API',
      'Gemini Enterprise Agent Platform',
    ];
    for (const q of aiplatformQueries) {
      const meta = taxonomy.findServiceMeta(q);
      expect(meta).toBeDefined();
      expect(meta?.name).toBe('Vertex AI');
      expect(meta?.ecosystem).toBe('AI/ML');
      expect(meta?.category).toBe('Generative AI');
      expect(taxonomy.getEcosystemForService(q)).toBe('AI/ML');
      expect(taxonomy.getCategoryForService(q)).toBe('Generative AI');
    }

    const discoveryengineQueries = [
      'discoveryengine',
      'discoveryengine.v1',
      'discoveryengine.v1alpha',
      'discoveryengine.v1beta',
      'discoveryengine:v1',
      'Vertex AI Agent Builder',
      'Discovery Engine API',
      'Vertex AI Search and Conversation',
      'Generative AI App Builder',
    ];
    for (const q of discoveryengineQueries) {
      const meta = taxonomy.findServiceMeta(q);
      expect(meta).toBeDefined();
      expect(meta?.name).toBe('Vertex AI Agent Builder');
      expect(meta?.ecosystem).toBe('AI/ML');
      expect(meta?.category).toBe('Generative AI');
      expect(taxonomy.getEcosystemForService(q)).toBe('AI/ML');
      expect(taxonomy.getCategoryForService(q)).toBe('Generative AI');
    }
  });

  it('dynamic ecosystem and category resolution', () => {
    for (const [apiName, meta] of Object.entries(watchedServices)) {
      const expectedEco = meta.ecosystem;
      const expectedCat = meta.category || null;
      const canonicalName = meta.name;

      expect(taxonomy.getEcosystemForService(apiName)).toBe(expectedEco);
      expect(taxonomy.getCategoryForService(apiName)).toBe(expectedCat);

      expect(taxonomy.getEcosystemForService(`${apiName}.v1`)).toBe(expectedEco);
      expect(taxonomy.getCategoryForService(`${apiName}.v1`)).toBe(expectedCat);

      expect(taxonomy.getEcosystemForService(canonicalName)).toBe(expectedEco);
      expect(taxonomy.getCategoryForService(canonicalName)).toBe(expectedCat);
    }

    expect(taxonomy.getEcosystemForService('unknown_service_xyz')).toBe('More');
    expect(taxonomy.getCategoryForService('unknown_service_xyz')).toBeNull();
  });

  it('watched API names list', () => {
    const names = taxonomy.getWatchedApiNames();
    expect(names).toEqual(Object.keys(servicesRaw).sort());
    expect(names.includes('bigquery')).toBe(true);
    expect(names.includes('aiplatform')).toBe(true);
    expect(names.includes('discoveryengine')).toBe(true);
  });

  it('release feeds', () => {
    expect(taxonomy.getReleaseFeedUrl('bigquery')).toBe('https://cloud.google.com/feeds/bigquery-release-notes.xml');
    expect(taxonomy.getReleaseFeedUrl('aiplatform')).toBe('https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml');
    expect(taxonomy.getReleaseFeedUrl('discoveryengine')).toBe('https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml');

    expect(taxonomy.getReleaseFeedUrl('unknown_service')).toBeNull();
    expect(taxonomy.getReleaseFeedUrls('unknown_service')).toEqual([]);

    const feeds = taxonomy.getOfficialReleaseFeeds();
    for (const [serviceKey, feedUrl] of Object.entries(feeds)) {
      expect(watchedServices[serviceKey]).toBeDefined();
      expect(feedUrl.startsWith('http://') || feedUrl.startsWith('https://')).toBe(true);
    }
  });
});
