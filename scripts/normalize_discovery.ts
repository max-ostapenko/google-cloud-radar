/**
 * Updates the discovery documents in the discoveries directory.
 * Sorts JSON keys in each discovery document to make semantic diffing clean and deterministic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function sortKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value[key]);
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
