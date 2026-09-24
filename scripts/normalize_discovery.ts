/**
 * Updates the discovery documents in the discoveries directory.
 * Sorts JSON keys in each discovery document to make semantic diffing clean and deterministic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keys where array element order is semantically meaningful and must not be sorted (b00b1e45)
export const PRESERVE_ARRAY_ORDER = new Set([
  'parameterOrder',
  'enum',
  'enumDescriptions',
  'enumDeprecated',
]);

export function sortKeys(value: any, keyName?: string): any {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => sortKeys(item));
    if (keyName && PRESERVE_ARRAY_ORDER.has(keyName)) {
      return mapped;
    }
    // Sort arrays of primitive strings/numbers
    if (mapped.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return [...mapped].sort((a, b) => String(a).localeCompare(String(b)));
    }
    // Sort arrays of objects deterministically by identifier or serialized content
    if (mapped.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      return [...mapped].sort((a, b) => {
        const keyA = a.name || a.id || a.location || a.endpointUrl || JSON.stringify(a);
        const keyB = b.name || b.id || b.location || b.endpointUrl || JSON.stringify(b);
        return String(keyA).localeCompare(String(keyB));
      });
    }
    return mapped;
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value[key], key);
    }
    return sorted;
  }
  return value;
}

export function normalizeDiscoveryFile(filePath: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const sorted = sortKeys(parsed);
    const formatted = JSON.stringify(sorted, null, 2) + '\n';
    fs.writeFileSync(filePath, formatted, 'utf-8');
    return true;
  } catch (err: any) {
    console.error(`Error normalizing ${filePath}:`, err.message);
    return false;
  }
}

export function normalizeDiscoveryDirectory(dirPath?: string): number {
  const targetDir = dirPath ? path.resolve(dirPath) : path.resolve(__dirname, '../discoveries');
  if (!fs.existsSync(targetDir)) {
    console.warn(`Discoveries directory does not exist: ${targetDir}`);
    return 0;
  }

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
  let count = 0;
  for (const file of files) {
    const fullPath = path.join(targetDir, file);
    if (normalizeDiscoveryFile(fullPath)) {
      count++;
    }
  }
  console.log(`Successfully normalized ${count} discovery documents in ${targetDir}`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirArg = process.argv[2];
  normalizeDiscoveryDirectory(dirArg);
}
