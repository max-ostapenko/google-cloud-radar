/**
 * Pre-processes a git diff of discovery JSON documents into a clean, structured
 * representation per API — stripping noise and surfacing semantically meaningful
 * additions, removals, and modifications.
 *
 * The output feeds directly into the LLM prompt.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Keys that change on every sync and carry no semantic value for developers
export const NOISE_KEYS = new Set([
  'revision',
  'etag',
  'rootUrl',
  'servicePath',
  'batchPath',
  'baseUrl',
  'basePath',
  'documentationLink',
  'ownerDomain',
  'ownerName',
  'packagePath',
  'id', // top-level only — filtered by path depth check
]);

// Top-level path segments that are structural/infrastructure, not developer API surface
export const NOISE_PATH_PREFIXES = new Set(['endpoints']);

// Keys that are only descriptive, not structural
export const DESCRIPTION_ONLY_KEYS = new Set(['description', 'title']);

// Maximum number of change entries per category to send to the LLM
export const MAX_ENTRIES_PER_CATEGORY = 60;

export function getChangedDiscoveryFiles(baseRef: string, headRef = 'WORKTREE'): string[] {
  let args: string[];
  if (!headRef || headRef === 'WORKTREE') {
    args = ['diff', '--name-only', baseRef, '--', 'discoveries/'];
  } else {
    args = ['diff', '--name-only', baseRef, headRef, '--', 'discoveries/'];
  }

  try {
    const stdout = execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.endsWith('.json'));
  } catch (err: any) {
    console.warn(`git diff --name-only failed: ${err.message}`);
    return [];
  }
}

export function getFileContentAtRef(ref: string, filepath: string): string {
  if (!ref || ref === 'WORKTREE') {
    try {
      return fs.readFileSync(filepath, 'utf-8');
    } catch {
      return '';
    }
  }

  try {
    return execFileSync('git', ['show', `${ref}:${filepath}`], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

export function flattenJson(obj: any, prefix = ''): Record<string, any> {
  const items: Record<string, any> = {};
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') {
        Object.assign(items, flattenJson(v, newKey));
      } else {
        items[newKey] = v;
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      const newKey = `${prefix}[${i}]`;
      if (v !== null && typeof v === 'object') {
        Object.assign(items, flattenJson(v, newKey));
      } else {
        items[newKey] = v;
      }
    }
  }
  return items;
}

export function isNoisePath(pathStr: string): boolean {
  const parts = pathStr.split('.');
  // Top-level noise keys (e.g. revision, etag)
  if (NOISE_KEYS.has(parts[0])) {
    return true;
  }
  // Top-level structural prefixes (e.g. endpoints[N].location — infra noise)
  const topSegment = parts[0].split('[')[0];
  if (NOISE_PATH_PREFIXES.has(topSegment)) {
    return true;
  }
  // The key at the leaf level is a noise key
  const leaf = parts[parts.length - 1].split('[')[0];
  if (NOISE_KEYS.has(leaf)) {
    return true;
  }
  return false;
}

export function isDescriptionOnly(pathStr: string): boolean {
  const parts = pathStr.split('.');
  const leaf = parts[parts.length - 1].split('[')[0];
  return DESCRIPTION_ONLY_KEYS.has(leaf);
}

export function detectBreakingChanges(
  oldFlat: Record<string, any>,
  newFlat: Record<string, any>,
  addedPaths: string[],
  removedPaths: string[],
  modifiedPaths: string[]
): [boolean, string[]] {
  const reasons: string[] = [];

  // 1. Inspect Added Paths (New required parameters or readOnly constraints on existing resources)
  for (const p of addedPaths) {
    const parts = p.split('.');
    const newVal = newFlat[p];
    if (
      parts[parts.length - 1] === 'required' &&
      parts.includes('parameters') &&
      (newVal === true || newVal === 'true')
    ) {
      const paramName = parts.length >= 2 ? parts[parts.length - 2] : 'parameter';
      const reason = `Parameter '${paramName}' was changed to strictly required`;
      if (!reasons.includes(reason)) reasons.push(reason);
    } else if (
      parts[parts.length - 1] === 'readOnly' &&
      parts.includes('schemas') &&
      parts.includes('properties') &&
      (newVal === true || newVal === 'true')
    ) {
      const sIdx = parts.indexOf('schemas');
      const pIdx = parts.indexOf('properties');
      const schemaName = parts.length > sIdx + 1 ? parts[sIdx + 1] : 'Schema';
      const propName = parts.length > pIdx + 1 ? parts[pIdx + 1] : 'property';
      const reason = `Property '${propName}' in schema '${schemaName}' was made read-only / immutable`;
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }

  // 2. Inspect Removed Paths
  for (const p of removedPaths) {
    const parts = p.split('.');

    // Removed API method
    if (parts.includes('methods')) {
      const idx = parts.indexOf('methods');
      if (parts.length > idx + 1) {
        const methodName = parts[idx + 1];
        if (
          parts.length === idx + 2 ||
          (parts.length === idx + 3 && ['httpMethod', 'id', 'path'].includes(parts[idx + 2]))
        ) {
          const reason = `Removed API method '${methodName}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }

    // Removed parameter from method
    if (parts.includes('parameters') && parts.includes('methods')) {
      const idx = parts.indexOf('parameters');
      if (parts.length > idx + 1) {
        const paramName = parts[idx + 1];
        if (
          parts.length === idx + 2 ||
          (parts.length === idx + 3 && ['type', 'location', 'format'].includes(parts[idx + 2]))
        ) {
          const reason = `Removed parameter '${paramName}' from method`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }

    // Removed default value from method parameter
    if (parts[parts.length - 1] === 'default' && parts.includes('parameters') && !parts.includes('schemas')) {
      const pIdx = parts.indexOf('parameters');
      if (parts.length > pIdx + 1) {
        const paramName = parts[pIdx + 1];
        const paramPrefix = parts.slice(0, pIdx + 2).join('.');
        if (Object.keys(newFlat).some((k) => k === paramPrefix || k.startsWith(`${paramPrefix}.`))) {
          const reason = `Default value for parameter '${paramName}' was removed`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }

    // Removed schema property
    if (parts.includes('schemas') && parts.includes('properties')) {
      const sIdx = parts.indexOf('schemas');
      const pIdx = parts.indexOf('properties');
      if (sIdx < pIdx && parts.length > pIdx + 1) {
        const schemaName = parts[sIdx + 1];
        const propName = parts[pIdx + 1];
        if (
          parts.length === pIdx + 2 ||
          (parts.length === pIdx + 3 && ['type', '$ref', 'format'].includes(parts[pIdx + 2]))
        ) {
          const reason = `Removed property '${propName}' from schema '${schemaName}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }
  }

  // 3. Inspect Modified Paths
  for (const p of modifiedPaths) {
    const parts = p.split('.');
    const oldVal = oldFlat[p];
    const newVal = newFlat[p];

    // Parameter made required
    if (parts[parts.length - 1] === 'required' && parts.includes('parameters')) {
      if ((oldVal === false || oldVal === null || oldVal === 'false') && (newVal === true || newVal === 'true')) {
        const paramName = parts.length >= 2 ? parts[parts.length - 2] : 'parameter';
        const reason = `Parameter '${paramName}' was changed to strictly required`;
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }

    // Parameter default value changed
    if (parts[parts.length - 1] === 'default' && parts.includes('parameters') && !parts.includes('schemas')) {
      const pIdx = parts.indexOf('parameters');
      if (parts.length > pIdx + 1) {
        const paramName = parts[pIdx + 1];
        const reason = `Default value for parameter '${paramName}' changed from '${oldVal}' to '${newVal}'`;
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }

    // Schema property type, $ref, or readOnly changes
    if (parts.includes('schemas') && parts.includes('properties')) {
      const sIdx = parts.indexOf('schemas');
      const pIdx = parts.indexOf('properties');
      if (sIdx < pIdx && parts.length > pIdx + 2) {
        const schemaName = parts[sIdx + 1];
        const propName = parts[pIdx + 1];
        const attr = parts[pIdx + 2];

        if (attr === 'type' && oldVal !== newVal) {
          const reason = `Property '${propName}' in schema '${schemaName}' changed type from '${oldVal}' to '${newVal}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        } else if (attr === '$ref' && oldVal !== newVal) {
          const reason = `Property '${propName}' in schema '${schemaName}' changed referenced type from '${oldVal}' to '${newVal}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        } else if (attr === 'readOnly' && (oldVal === false || oldVal === null) && newVal === true) {
          const reason = `Property '${propName}' in schema '${schemaName}' was made read-only / immutable`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }

    // Method HTTP verb or URI path template change
    if (parts.includes('methods')) {
      const mIdx = parts.indexOf('methods');
      if (parts.length > mIdx + 2) {
        const methodName = parts[mIdx + 1];
        const attr = parts[mIdx + 2];
        if (attr === 'httpMethod' && oldVal !== newVal) {
          const reason = `Method '${methodName}' changed HTTP verb from '${oldVal}' to '${newVal}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        } else if (attr === 'path' && oldVal !== newVal) {
          const reason = `Method '${methodName}' URI path template changed from '${oldVal}' to '${newVal}'`;
          if (!reasons.includes(reason)) reasons.push(reason);
        }
      }
    }
  }

  // 4. Parameter Enum Value Removal
  const enumParamPrefixes = new Set<string>();
  for (const k of Object.keys(oldFlat)) {
    if (k.includes('.enum[')) {
      const parts = k.split('.');
      if (parts.includes('parameters') && !parts.includes('schemas')) {
        const pIdx = parts.indexOf('parameters');
        if (parts.length > pIdx + 1) {
          const paramPrefix = parts.slice(0, pIdx + 2).join('.');
          enumParamPrefixes.add(paramPrefix);
        }
      }
    }
  }

  for (const paramPrefix of Array.from(enumParamPrefixes).sort()) {
    if (!Object.keys(newFlat).some((k) => k === paramPrefix || k.startsWith(`${paramPrefix}.`))) {
      continue; // Parameter itself was removed; handled by parameter removal check
    }

    const parts = paramPrefix.split('.');
    const pIdx = parts.indexOf('parameters');
    const paramName = parts[pIdx + 1];

    const oldEnums = new Set(
      Object.entries(oldFlat)
        .filter(([k]) => k.startsWith(`${paramPrefix}.enum[`))
        .map(([, v]) => String(v))
    );
    const newEnums = new Set(
      Object.entries(newFlat)
        .filter(([k]) => k.startsWith(`${paramPrefix}.enum[`))
        .map(([, v]) => String(v))
    );

    const removedEnums = Array.from(oldEnums).filter((x) => !newEnums.has(x));
    for (const val of removedEnums.sort()) {
      const reason = `Removed enum value '${val}' from parameter '${paramName}'`;
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }

  const isBreaking = reasons.length > 0;
  return [isBreaking, reasons];
}

export function extractMethodIdentifiersFromPaths(paths: Set<string> | string[]): string[] {
  const methods = new Set<string>();
  for (const p of paths) {
    const parts = p.split('.');
    if (parts.includes('methods')) {
      const idx = parts.indexOf('methods');
      if (parts.length > idx + 1) {
        const methodName = parts[idx + 1];
        const resParts = parts.slice(0, idx).filter((part) => part !== 'resources' && part !== 'methods');
        const methodId = resParts.length > 0 ? `${resParts.join('.')}.${methodName}` : methodName;
        methods.add(methodId.toLowerCase());
      }
    }
  }
  return Array.from(methods).sort();
}

export function buildStructuredDiff(
  filename: string,
  oldJsonStr: string,
  newJsonStr: string
): Record<string, any> | null {
  let oldObj: any = {};
  let newObj: any = {};

  try {
    oldObj = oldJsonStr && oldJsonStr.trim() ? JSON.parse(oldJsonStr) : {};
    newObj = newJsonStr && newJsonStr.trim() ? JSON.parse(newJsonStr) : {};
  } catch (err: any) {
    console.warn(`Could not parse JSON for ${filename}: ${err.message}`);
    return null;
  }

  const oldFlat = flattenJson(oldObj);
  const newFlat = flattenJson(newObj);

  const oldKeys = new Set(Object.keys(oldFlat));
  const newKeys = new Set(Object.keys(newFlat));

  const addedPaths = Array.from(newKeys).filter((k) => !oldKeys.has(k));
  const removedPaths = Array.from(oldKeys).filter((k) => !newKeys.has(k));
  const commonPaths = Array.from(oldKeys).filter((k) => newKeys.has(k));
  const modifiedPaths = commonPaths.filter((p) => oldFlat[p] !== newFlat[p]);

  const filterNoise = (paths: string[]) => paths.filter((p) => !isNoisePath(p));

  const added = filterNoise(addedPaths);
  const removed = filterNoise(removedPaths);
  const modified = filterNoise(modifiedPaths);

  if ((Object.keys(newFlat).length === 0 && Object.keys(oldFlat).length > 0) ||
      (Object.keys(newFlat).length < 5 && removed.length > 40 && added.length === 0)) {
    console.info(`  ${filename}: document wiped or deleted (${removed.length} removals). Skipping.`);
    return null;
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    return null;
  }

  const [isBreaking, breakingReasons] = detectBreakingChanges(
    oldFlat,
    newFlat,
    added,
    removed,
    modified
  );

  const addedEntries = added.sort().slice(0, MAX_ENTRIES_PER_CATEGORY).map((p) => {
    const entry: Record<string, any> = { path: p };
    const val = newFlat[p];
    if (val !== null && typeof val !== 'object') entry.value = val;
    return entry;
  });

  const removedEntries = removed.sort().slice(0, MAX_ENTRIES_PER_CATEGORY).map((p) => {
    const entry: Record<string, any> = { path: p };
    const val = oldFlat[p];
    if (val !== null && typeof val !== 'object') entry.old_value = val;
    return entry;
  });

  const modifiedEntries = modified.sort().slice(0, MAX_ENTRIES_PER_CATEGORY).map((p) => ({
    path: p,
    old: oldFlat[p],
    new: newFlat[p],
  }));

  const apiName = filename.replace('.json', '');
  const allChangedPaths = new Set([...added, ...removed, ...modified]);
  const extractedMethods = extractMethodIdentifiersFromPaths(allChangedPaths);
  const targetPaths = Array.from(allChangedPaths).sort();

  return {
    api: apiName,
    is_breaking: isBreaking,
    breaking_reasons: breakingReasons,
    added: addedEntries,
    removed: removedEntries,
    modified: modifiedEntries,
    extracted_methods: extractedMethods,
    target_paths: targetPaths,
    _stats: {
      added_count: added.length,
      removed_count: removed.length,
      modified_count: modified.length,
      description_only_modified: modified.filter(isDescriptionOnly).length,
      is_breaking: isBreaking,
      breaking_reasons: breakingReasons,
    },
  };
}

export function extractStructuredDiffs(
  baseRef = 'HEAD',
  headRef = 'WORKTREE'
): Array<Record<string, any>> {
  console.log(`Detecting changed discovery files between ${baseRef} and ${headRef} ...`);
  const changedPaths = getChangedDiscoveryFiles(baseRef, headRef).filter(
    (p) => !p.endsWith('index.json')
  );

  if (changedPaths.length === 0) {
    console.log('No discovery files changed — nothing to analyse');
    return [];
  }

  const results: Array<Record<string, any>> = [];
  for (const filepath of changedPaths.sort()) {
    const filename = filepath.split('/').pop() || filepath;
    const oldContent = getFileContentAtRef(baseRef, filepath);
    const newContent = getFileContentAtRef(headRef, filepath);
    const diff = buildStructuredDiff(filename, oldContent, newContent);
    if (diff !== null) {
      results.push(diff);
    }
  }

  console.log(`Produced ${results.length} non-trivial structured diffs`);
  return results;
}
