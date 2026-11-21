/**
 * Utility module for generating multi-language migration snippets (Python, TypeScript, cURL)
 * and structured schema diff payloads for Google Cloud Radar change entries.
 */

export interface CodeSnippets {
  python: string;
  typescript: string;
  curl: string;
}

export interface SchemaDiffEntry {
  path: string;
  value?: any;
  old_value?: any;
  old?: any;
  new?: any;
}

export interface SchemaDiffPayload {
  added: SchemaDiffEntry[];
  removed: SchemaDiffEntry[];
  modified: SchemaDiffEntry[];
  breaking_reasons: string[];
  target_paths: string[];
}

/**
 * Normalizes service name and module/package identifiers for GCP client SDK code generation.
 */
function resolveSdkIdentifiers(api: string, serviceName: string): {
  serviceName: string;
  apiName: string;
  version: string;
  pythonModule: string;
  tsPackage: string;
  tsClass: string;
  endpointPrefix: string;
} {
  const cleanApi = (api || 'service.v1').toLowerCase();
  const parts = cleanApi.split('.');
  const rawName = parts[0] || 'cloud';
  const version = parts[parts.length - 1] || 'v1';

  const cleanService = serviceName || rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const snakeName = rawName.replace(/[^a-z0-9]/g, '_');
  const kebabName = rawName.replace(/[^a-z0-9]/g, '-');
  const pascalName = rawName
    .split(/[^a-z0-9]/i)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');

  return {
    serviceName: cleanService,
    apiName: cleanApi,
    version,
    pythonModule: snakeName,
    tsPackage: kebabName,
    tsClass: `${pascalName}Client`,
    endpointPrefix: `${kebabName}.googleapis.com`,
  };
}

/**
 * Generates multi-language migration code snippets for Python, TypeScript, and cURL.
 */
export function generateCodeSnippets(record: Record<string, any>): CodeSnippets {
  // If record already contains valid non-empty snippets object, validate and normalize it
  if (
    record.code_snippets &&
    typeof record.code_snippets === 'object' &&
    typeof record.code_snippets.python === 'string' &&
    typeof record.code_snippets.typescript === 'string' &&
    typeof record.code_snippets.curl === 'string' &&
    record.code_snippets.python.trim() &&
    record.code_snippets.typescript.trim() &&
    record.code_snippets.curl.trim()
  ) {
    return {
      python: record.code_snippets.python.trim(),
      typescript: record.code_snippets.typescript.trim(),
      curl: record.code_snippets.curl.trim(),
    };
  }

  const api = String(record.api || record.service_id || 'google.cloud.v1');
  const service = String(record.service || record.service_name || 'Google Cloud');
  const methods: string[] = Array.isArray(record.extracted_methods) ? record.extracted_methods : [];
  const targetPaths: string[] = Array.isArray(record.target_paths) ? record.target_paths : [];
  const summary = String(record.summary || record.title || '');

  const sdk = resolveSdkIdentifiers(api, service);
  const primaryMethod = methods.length > 0 ? methods[0] : `${sdk.pythonModule}.${sdk.version}.request`;
  const isBreaking = Boolean(record.breaking || record.is_breaking);

  // Python Snippet
  const pyComment = isBreaking
    ? `# BREAKING CHANGE REMEDIATION: ${summary.slice(0, 80)}`
    : `# Migration Snippet for ${sdk.serviceName} (${sdk.apiName})`;

  const pyMethodCall = primaryMethod.includes('.')
    ? primaryMethod.split('.').pop()!
    : 'execute_request';

  const pyTargetComments = targetPaths.length > 0
    ? targetPaths.slice(0, 3).map((p) => `# - Impacted path: ${p}`).join('\n')
    : '# - Inspect request payload structure';

  const python = `${pyComment}
from google.cloud import ${sdk.pythonModule}_${sdk.version} as ${sdk.pythonModule}

client = ${sdk.pythonModule}.${sdk.tsClass}()

# Updated method invocation: ${primaryMethod}
# Note the following schema modifications:
${pyTargetComments}

request = ${sdk.pythonModule}.types.Request(
    # Ensure updated required parameters are supplied
)

response = client.${pyMethodCall}(request=request)
print(f"Updated ${sdk.serviceName} response: {response}")
`.trim();

  // TypeScript Snippet
  const tsComment = isBreaking
    ? `// BREAKING CHANGE REMEDIATION: ${summary.slice(0, 80)}`
    : `// Migration Snippet for ${sdk.serviceName} (${sdk.apiName})`;

  const tsMethodName = primaryMethod.includes('.')
    ? primaryMethod.split('.').pop()!
    : 'executeRequest';

  const typescript = `${tsComment}
import { ${sdk.tsClass} } from '@google-cloud/${sdk.tsPackage}';

const client = new ${sdk.tsClass}();

async function migrateApiCall() {
  // Method: ${primaryMethod}
  // Impacted JSON paths: ${targetPaths.slice(0, 2).join(', ') || 'See change details'}
  const request = {
    // Pass updated parameter schema fields
  };

  const [response] = await client.${tsMethodName}(request);
  console.log('Migrated API response:', response);
}

migrateApiCall().catch(console.error);
`.trim();

  // cURL Snippet
  const curlMethod = primaryMethod.replace(/\./g, '/');
  const curl = `# cURL REST API Call for ${sdk.serviceName} (${sdk.apiName})
# Auth: Requires OAuth 2.0 bearer token with appropriate GCP scopes

curl -X POST \\
  "https://${sdk.endpointPrefix}/${sdk.version}/${curlMethod}" \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '{
    # Review updated parameter specifications:
    ${targetPaths.length > 0 ? `# Path: ${targetPaths[0]}` : '# Add request body parameters here'}
  }'
`.trim();

  return {
    python,
    typescript,
    curl,
  };
}

/**
 * Generates a clean, structured schema diff payload from record diff data.
 */
export function generateSchemaDiffPayload(recordOrDiff: Record<string, any>): SchemaDiffPayload {
  const existingDiff = recordOrDiff.schema_diff;
  if (
    existingDiff &&
    typeof existingDiff === 'object' &&
    Array.isArray(existingDiff.added) &&
    Array.isArray(existingDiff.removed) &&
    Array.isArray(existingDiff.modified)
  ) {
    return {
      added: existingDiff.added,
      removed: existingDiff.removed,
      modified: existingDiff.modified,
      breaking_reasons: Array.isArray(existingDiff.breaking_reasons) ? existingDiff.breaking_reasons : [],
      target_paths: Array.isArray(existingDiff.target_paths) ? existingDiff.target_paths : [],
    };
  }

  const added: SchemaDiffEntry[] = Array.isArray(recordOrDiff.added)
    ? recordOrDiff.added.slice(0, 20)
    : [];
  const removed: SchemaDiffEntry[] = Array.isArray(recordOrDiff.removed)
    ? recordOrDiff.removed.slice(0, 20)
    : [];
  const modified: SchemaDiffEntry[] = Array.isArray(recordOrDiff.modified)
    ? recordOrDiff.modified.slice(0, 20)
    : [];

  const breakingReasons: string[] = Array.isArray(recordOrDiff.breaking_reasons)
    ? recordOrDiff.breaking_reasons
    : [];

  const targetPaths: string[] = Array.isArray(recordOrDiff.target_paths)
    ? recordOrDiff.target_paths
    : Array.isArray(recordOrDiff.extracted_paths)
    ? recordOrDiff.extracted_paths
    : [];

  // Fallback construction if direct diff categories are not attached
  if (added.length === 0 && removed.length === 0 && modified.length === 0 && targetPaths.length > 0) {
    for (const p of targetPaths.slice(0, 20)) {
      if (breakingReasons.some((r) => r.toLowerCase().includes('removed') && r.includes(p))) {
        removed.push({ path: p });
      } else if (breakingReasons.some((r) => r.toLowerCase().includes('required') || r.toLowerCase().includes('added'))) {
        added.push({ path: p });
      } else {
        modified.push({ path: p });
      }
    }
  }

  return {
    added,
    removed,
    modified,
    breaking_reasons: breakingReasons,
    target_paths: targetPaths,
  };
}
