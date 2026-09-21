/**
 * Uploads and migrates all curated Google Cloud Radar change entries
 * directly into Google Cloud Firestore using the official @google-cloud/firestore SDK.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Firestore } from '@google-cloud/firestore';
import { getCategoryForService } from './taxonomy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function slugify(text: string): string {
  return text
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .toLowerCase();
}

export function parseJsonChangeFile(filePath: string): Record<string, any> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  const slug = data.slug || data.id || path.basename(filePath).replace('.json', '');
  const serviceName = data.service || data.service_name || data.api || 'Google Cloud';
  const serviceId = slugify(serviceName);
  const api = data.api || slug.split('-').slice(3).join('-') || '';
  const version = api.includes('.') ? api.split('.').pop()! : 'v1';
  const dateStr = String(data.date || slug.slice(0, 10)).slice(0, 10);
  const title = data.title || `${serviceName} Update`;
  const impact = String(data.impact || 'medium').toLowerCase();
  const breaking = Boolean(data.breaking ?? data.is_breaking);
  const interestingScore = Number(data.interesting_score ?? 5);
  const tags = Array.isArray(data.tags) ? data.tags : [serviceName, 'Google Cloud'];
  const status = String(data.status || 'canary').toLowerCase();
  const category = data.category || getCategoryForService(serviceName) || null;
  const leadTimeDays = status === 'released' ? (data.lead_time_days ?? null) : null;
  const summary = data.summary || '';
  const details = data.details || summary;
  const extractedMethods = Array.isArray(data.extracted_methods) ? data.extracted_methods : [];

  const createdIso = `${dateStr}T00:00:00.000Z`;
  const nowIso = new Date().toISOString();

  const doc: Record<string, any> = {
    id: slug,
    slug,
    service_id: serviceId,
    service_name: serviceName,
    api,
    version,
    category,
    title,
    summary,
    details_markdown: details,
    impact,
    is_breaking: breaking,
    interesting_score: interestingScore,
    status,
    lead_time_days: leadTimeDays,
    first_detected_at: createdIso,
    last_updated_at: nowIso,
    tags,
    extracted_methods: extractedMethods,
    reaction_counts: {
      like_change: 0,
      released: 0,
      false_positive_or_duplicate: 0,
    },
    comments_count: 0,
    stats: JSON.stringify({
      views: 100 + interestingScore * 45,
      subscribers: 10 + interestingScore * 3,
      upvotes: 5 + interestingScore * 2,
      impacted_users_count: breaking ? 2 : 0,
    }),
  };

  if (data.official_release_date) {
    doc.official_release_date = String(data.official_release_date);
  }
  if (data.official_release_notes_url) {
    doc.official_release_notes_url = String(data.official_release_notes_url);
  }

  return doc;
}

export async function seedFirestore(options: {
  projectId: string;
  databaseId?: string;
  dataDir?: string;
}): Promise<number> {
  const targetDir = options.dataDir
    ? path.resolve(options.dataDir)
    : path.resolve(__dirname, '../data/changes');

  if (!fs.existsSync(targetDir)) {
    console.warn(`⚠️ Directory not found: ${targetDir}`);
    return 0;
  }

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.warn(`⚠️ No JSON files found in ${targetDir}`);
    return 0;
  }

  console.log(
    `🚀 Starting Firestore migration to project '${options.projectId}' (database: '${options.databaseId || '(default)'}')...`
  );
  console.log(`📄 Found ${files.length} change records in ${targetDir}/\n`);

  const firestore = new Firestore({
    projectId: options.projectId,
    databaseId: options.databaseId || '(default)',
  });

  let successCount = 0;
  const batchSize = 100;
  for (let i = 0; i < files.length; i += batchSize) {
    const batchFiles = files.slice(i, i + batchSize);
    const writeBatch = firestore.batch();

    for (const file of batchFiles) {
      const filePath = path.join(targetDir, file);
      try {
        const doc = parseJsonChangeFile(filePath);
        const ref = firestore.collection('changes').doc(doc.slug);
        writeBatch.set(ref, doc, { merge: true });
        successCount++;
        const statusIcon = doc.is_breaking ? '⚠️' : '✨';
        console.log(`[${successCount}/${files.length}] ${statusIcon} Upserted: ${doc.slug} (${doc.service_name})`);
      } catch (err: any) {
        console.error(`❌ Failed ${file}: ${err.message}`);
      }
    }

    await writeBatch.commit();
  }

  console.log(
    `\n🎉 Successfully migrated ${successCount}/${files.length} changes to Cloud Firestore in ${options.projectId}!`
  );
  return successCount;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const projectId = projectIdx !== -1 ? args[projectIdx + 1] : process.env.GCP_PROJECT || 'gcp-cloud-radar';
  const databaseIdx = args.indexOf('--database');
  const databaseId = databaseIdx !== -1 ? args[databaseIdx + 1] : 'radar';
  const dataDirIdx = args.indexOf('--data-dir');
  const dataDir = dataDirIdx !== -1 ? args[dataDirIdx + 1] : undefined;

  seedFirestore({ projectId, databaseId, dataDir }).catch((err) => {
    console.error('Fatal seed_prod_firestore error:', err);
    process.exit(1);
  });
}
