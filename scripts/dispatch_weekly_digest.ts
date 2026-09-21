/**
 * Dispatches a curated weekly intelligence digest to registered subscribers
 * every Monday morning, summarizing pre-release Google API changes, breaking
 * changes, and new methods detected over the last 7 days.
 *
 * Supports Resend API with idempotency tracking in Cloud Firestore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';
import { escapeHtml, isDevEnvironment, sendResendEmail } from './dispatch_email_alerts.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
export const CHANGES_DIR = path.join(DATA_DIR, 'changes');

// Load environment variables from .env if present
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

export const DEFAULT_GCP_PROJECT = 'gcp-cloud-radar';
export const DEFAULT_FIRESTORE_DB = 'radar';
export const DEFAULT_FROM_EMAIL = 'Google Cloud Radar <alerts@google-cloud-radar.com>';
export const FALLBACK_SANDBOX_FROM_EMAIL = 'Google Cloud Radar <onboarding@resend.dev>';

export interface WeeklySubscriber {
  uid: string;
  email: string;
  all_services: boolean;
  watched_services: string[];
}

export function loadRecentChanges(days: number = 7, customChangesDir?: string): any[] {
  const dir = customChangesDir ? path.resolve(customChangesDir) : CHANGES_DIR;
  if (!fs.existsSync(dir)) {
    console.warn(`Changes directory not found at ${dir}`);
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  const changes: any[] = [];

  for (const file of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const docDate = doc.date || '';
      if (docDate >= cutoffDate) {
        changes.push(doc);
      }
    } catch (err: any) {
      console.warn(`Failed to read change document ${file}: ${err.message}`);
    }
  }

  return changes;
}

export function filterChangesForSubscriber(changes: any[], subscriber: {
  all_services?: boolean;
  allServices?: boolean;
  watched_services?: string[];
  watchedServices?: string[];
}): any[] {
  const allServices = subscriber.all_services ?? subscriber.allServices ?? true;
  if (allServices) {
    return changes;
  }

  const watched = new Set(subscriber.watched_services ?? subscriber.watchedServices ?? []);
  const matched: any[] = [];

  for (const c of changes) {
    const rawSvc = (c.service || c.service_name || '').toLowerCase();
    const slug = rawSvc.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let isMatch = watched.has(slug);
    if (!isMatch) {
      for (const w of watched) {
        if (slug.includes(w)) {
          isMatch = true;
          break;
        }
      }
    }
    if (isMatch) {
      matched.push(c);
    }
  }

  return matched;
}

export function renderWeeklyDigestHtml(changes: any[], weekLabel?: string): string {
  if (!weekLabel) {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    weekLabel = `Week of ${formattedDate}`;
  }

  const totalChanges = changes.length;
  const breakingChanges = changes.filter((c) => c.breaking);
  const nonBreakingChanges = changes.filter((c) => !c.breaking);
  const breakingCount = breakingChanges.length;
  const nonBreakingCount = nonBreakingChanges.length;

  const uniqueServices = new Set<string>();
  let totalMethods = 0;
  for (const c of changes) {
    const svc = c.service || c.service_name;
    if (svc) {
      uniqueServices.add(svc);
    }
    totalMethods += (c.extracted_methods || []).length;
  }
  const servicesCount = uniqueServices.size;

  // Render Breaking Changes Highlight Section
  let breakingItemsHtml = '';
  if (breakingChanges.length > 0) {
    for (const c of breakingChanges.slice(0, 5)) {
      const svcName = escapeHtml(c.service || c.service_name || 'Google Cloud');
      const rawTitle = c.title || '';
      const title = escapeHtml(rawTitle);
      const displayTitle = rawTitle.toLowerCase().startsWith(svcName.toLowerCase())
        ? title
        : `${svcName}: ${title}`;
      const slug = c.slug || c.id || '';
      const summary = escapeHtml(c.summary || '');
      const reasons: string[] = c.breaking_reasons || [];
      const reasonText = reasons.length > 0
        ? ` · <span style='color: #b3261e;'>${escapeHtml(reasons[0])}</span>`
        : '';

      breakingItemsHtml += `
            <div style="margin-bottom: 14px; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e0e0e0; border-left: 4px solid #ea4335; border-radius: 6px;">
              <div style="margin-bottom: 6px;">
                <span style="display: inline-block; font-size: 10px; font-weight: 700; background-color: #fce8e6; color: #c5221f; border: 1px solid #fad2cf; padding: 2px 7px; border-radius: 4px; text-transform: uppercase;">
                  ⚠️ Breaking Change
                </span>
              </div>
              <h3 style="font-size: 14.5px; font-weight: 700; color: #202124; margin: 0 0 6px 0; line-height: 1.35;">
                <a href="https://google-cloud-radar.com/changes/${slug}" target="_blank" style="color: #202124; text-decoration: none;">
                  ${displayTitle}
                </a>
              </h3>
              <p style="font-size: 12.5px; color: #474747; margin: 0 0 8px 0; line-height: 1.45;">
                ${summary}${reasonText}
              </p>
              <a href="https://google-cloud-radar.com/changes/${slug}" target="_blank" style="font-size: 12px; font-weight: 600; color: #1a73e8; text-decoration: none;">
                View AST Diff &amp; Impact Analysis →
              </a>
            </div>
            `;
    }
  }

  // Render Other Recent Updates Section (Sorted by impact - non-breaking only)
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedNonBreaking = [...nonBreakingChanges].sort((a, b) => {
    const orderA = impactOrder[(a.impact || 'low').toLowerCase()] ?? 3;
    const orderB = impactOrder[(b.impact || 'low').toLowerCase()] ?? 3;
    return orderA - orderB;
  });

  let regularItemsHtml = '';
  for (const c of sortedNonBreaking.slice(0, 12)) {
    const svcName = escapeHtml(c.service || c.service_name || 'Google Cloud');
    const api = escapeHtml(c.api || '');
    const title = escapeHtml(c.title || '');
    const slug = c.slug || c.id || '';
    const summary = escapeHtml(c.summary || '');
    const impact = (c.impact || 'low').toUpperCase();

    let badgeStyle = 'background-color: #f1f3f4; color: #5f6368; border: 1px solid #dadce0;';
    if (impact === 'HIGH') {
      badgeStyle = 'background-color: #fef7e0; color: #b06000; border: 1px solid #fce8b2;';
    } else if (impact === 'MEDIUM') {
      badgeStyle = 'background-color: #e8f0fe; color: #1967d2; border: 1px solid #d2e3fc;';
    }

    const badgeText = `${impact} IMPACT`;
    const methods = c.extracted_methods || [];
    const methodsChip = methods.length > 0
      ? `<span style='font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; background: #f1f3f4; color: #3c4043; padding: 2px 6px; border-radius: 4px; margin-left: 6px;'>+${methods.length} methods</span>`
      : '';

    regularItemsHtml += `
        <div style="padding: 16px 0; border-bottom: 1px solid #eeeeee;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;">
            <tr>
              <td style="font-size: 12px; color: #5f6368; vertical-align: middle;">
                <strong style="color: #202124;">${svcName}</strong> &nbsp;•&nbsp; <code style="font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; color: #5f6368; background-color: #f8f9fa; padding: 2px 5px; border-radius: 3px; border: 1px solid #e8eaed;">${api}</code>${methodsChip}
              </td>
              <td align="right" style="vertical-align: middle;">
                <span style="font-size: 9.5px; font-weight: 700; ${badgeStyle} padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px;">
                  ${badgeText}
                </span>
              </td>
            </tr>
          </table>
          <h3 style="font-size: 14.5px; font-weight: 600; color: #1a73e8; margin: 0 0 6px 0; line-height: 1.4;">
            <a href="https://google-cloud-radar.com/changes/${slug}" target="_blank" style="color: #1a73e8; text-decoration: none;">
              ${title}
            </a>
          </h3>
          <p style="font-size: 12.5px; color: #474747; line-height: 1.5; margin: 0;">
            ${summary}
          </p>
        </div>
        `;
  }

  const breakingSection = breakingChanges.length > 0
    ? `
              <div style="margin-bottom: 24px;">
                <h2 style="font-size: 14px; font-weight: 700; color: #b3261e; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
                  ⚠️ Breaking Changes (${breakingCount})
                </h2>
                ${breakingItemsHtml}
              </div>
      `
    : '';

  const updatesSection = regularItemsHtml
    ? `
              <div>
                <h2 style="font-size: 14px; font-weight: 700; color: #202124; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
                  🚀 New Features &amp; Schema Updates (${nonBreakingCount})
                </h2>
                ${regularItemsHtml}
              </div>
      `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Cloud Radar — Weekly Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #202124; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dadce0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <!-- Header Branding -->
          <tr>
            <td style="padding: 24px; background-color: #202124; border-bottom: 1px solid #3c4043;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">
                      Google Cloud <span style="color: #8ab4f8;">Radar</span>
                    </span>
                    <div style="font-size: 12px; color: #9aa0a6; margin-top: 4px;">
                      Pre-Release API Intelligence & Telemetry
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="background-color: rgba(66,133,244,0.2); color: #8ab4f8; border: 1px solid #4285f4; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                      Weekly Digest
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Hero Banner -->
          <tr>
            <td style="padding: 20px 24px; background-color: #f1f3f4; border-bottom: 1px solid #dadce0;">
              <div style="font-size: 13px; font-weight: 700; color: #202124; margin-bottom: 8px;">
                📅 ${weekLabel}
              </div>
              <div style="font-size: 12.5px; color: #5f6368; line-height: 1.5;">
                Detected <strong>${totalChanges} updates</strong> across <strong>${servicesCount} Google Cloud services</strong>, including <strong>${breakingCount} breaking changes</strong> and <strong>${totalMethods} new API methods</strong>.
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px;">
              ${breakingSection}
              ${updatesSection}

              <!-- CTA Hub -->
              <div style="text-align: center; margin-top: 28px; margin-bottom: 12px;">
                <a href="https://google-cloud-radar.com" target="_blank" style="display: inline-block; background-color: #1a73e8; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 1px 3px rgba(26,115,232,0.3);">
                  Explore Full Radar Feed →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 24px; background-color: #f8f9fa; border-top: 1px solid #dadce0; text-align: center; font-size: 12px; color: #70757a;">
              You received this weekly digest because you enabled email updates on <a href="https://google-cloud-radar.com" style="color: #1a73e8; text-decoration: none;">Google Cloud Radar</a>.<br><br>
              <a href="https://google-cloud-radar.com/?action=alerts" style="color: #5f6368; text-decoration: underline;">Manage Alert Preferences</a> &nbsp;|&nbsp; <a href="https://google-cloud-radar.com/stats" style="color: #5f6368; text-decoration: underline;">90-Day Cloud Velocity Benchmark</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function fetchFirestoreWeeklySubscribers(
  projectId: string = DEFAULT_GCP_PROJECT,
  databaseId: string = DEFAULT_FIRESTORE_DB
): Promise<WeeklySubscriber[]> {
  try {
    const firestore = new Firestore({ projectId, databaseId: databaseId || '(default)' });
    const snapshot = await firestore.collection('users').get();
    const subscribers: WeeklySubscriber[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const email = data.email || '';
      const uid = data.uid || doc.id;
      const weeklyDigest = data.weeklyDigest ?? data.weekly_digest ?? true;
      const allServices = data.allServices ?? data.all_services ?? true;
      const watchedServices = Array.isArray(data.watchedServices)
        ? data.watchedServices
        : Array.isArray(data.watched_services)
        ? data.watched_services
        : [];

      if (email && weeklyDigest) {
        subscribers.push({
          uid,
          email,
          all_services: allServices,
          watched_services: watchedServices,
        });
      }
    }
    return subscribers;
  } catch (err: any) {
    console.warn(`Failed to fetch Firestore subscribers: ${err.message}`);
    return [];
  }
}

export async function hasWeeklyDigestBeenSent(
  firestore: Firestore,
  dispatchId: string
): Promise<boolean> {
  try {
    const doc = await firestore.collection('alert_dispatches').doc(dispatchId).get();
    return doc.exists;
  } catch {
    return false;
  }
}

export async function recordWeeklyDigestSent(
  firestore: Firestore,
  dispatchId: string,
  email: string
): Promise<void> {
  try {
    await firestore.collection('alert_dispatches').doc(dispatchId).set(
      {
        dispatch_id: dispatchId,
        type: 'weekly_digest',
        recipient_email: email,
        sent_at: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`Recorded weekly dispatch ${dispatchId} in Firestore.`);
  } catch (err: any) {
    console.warn(`Failed to record weekly dispatch in Firestore: ${err.message}`);
  }
}

export function getIsoWeekNumber(date: Date): [number, number] {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return [d.getUTCFullYear(), weekNo];
}

export async function runDispatchWeeklyDigest(options?: {
  testEmail?: string;
  dryRun?: boolean;
  days?: number;
  project?: string;
  database?: string;
  fromEmail?: string;
}): Promise<void> {
  const days = options?.days ?? 7;
  const dryRun = Boolean(options?.dryRun);
  const projectId = options?.project || DEFAULT_GCP_PROJECT;
  const databaseId = options?.database || DEFAULT_FIRESTORE_DB;
  const testEmail = options?.testEmail;
  const rawFrom =
    options?.fromEmail?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_FROM_EMAIL;
  const fromEmail = rawFrom;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey && !dryRun) {
    console.error('RESEND_API_KEY environment variable is missing. Cannot dispatch emails.');
    process.exit(1);
  }

  // 1. Load target weekly changes
  const changes = loadRecentChanges(days);
  if (changes.length === 0) {
    console.log(`No changes found in the last ${days} days to include in digest.`);
    return;
  }

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const [isoYear, isoWeek] = getIsoWeekNumber(today);
  const weekLabel = `Week of ${formattedDate}`;
  const subject = `📬 [Weekly Radar] Google Cloud Pre-Release Intelligence (${weekLabel})`;

  console.log(`Loaded ${changes.length} change(s) for the weekly digest.`);

  // 2. Test mode dispatch
  if (testEmail) {
    const htmlBody = renderWeeklyDigestHtml(changes, weekLabel);
    console.log(`Dispatching TEST WEEKLY DIGEST to ${testEmail} with ${changes.length} changes`);

    if (dryRun) {
      console.log(`\n--- SUBJECT: ${subject} ---`);
      console.log(`--- TO: ${testEmail} ---`);
      console.log(`--- FROM: ${fromEmail} ---`);
      console.log('--- HTML BODY PREVIEW (first 400 chars) ---');
      console.log(htmlBody.slice(0, 400) + '...');
      return;
    }

    const isDev = isDevEnvironment();
    const success = await sendResendEmail({
      apiKey: apiKey!,
      fromEmail,
      toEmail: testEmail,
      subject,
      htmlContent: htmlBody,
      allowDevFallback: isDev || Boolean(testEmail),
    });

    if (success) {
      console.log('🎉 Test weekly digest dispatched successfully!');
    } else {
      process.exit(1);
    }
    return;
  }

  // 3. Production subscriber loop
  const subscribers = await fetchFirestoreWeeklySubscribers(projectId, databaseId);
  console.log(`Found ${subscribers.length} active weekly digest subscriber(s) in Firestore.`);

  if (subscribers.length === 0 && !dryRun) {
    console.log('No weekly digest subscribers currently registered in Firestore. Done.');
    return;
  }

  const firestore = new Firestore({ projectId, databaseId: databaseId || '(default)' });
  let totalSent = 0;
  const isDev = isDevEnvironment();

  for (const sub of subscribers) {
    const email = sub.email;
    const subChanges = filterChangesForSubscriber(changes, sub);
    if (subChanges.length === 0) {
      continue;
    }

    const cleanEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
    const dispatchId = `weekly_${isoYear}_w${isoWeek}_${cleanEmail}`;

    if (await hasWeeklyDigestBeenSent(firestore, dispatchId)) {
      continue;
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Would send weekly digest (${subChanges.length} changes) to ${email}`);
      continue;
    }

    const htmlBody = renderWeeklyDigestHtml(subChanges, weekLabel);
    const sent = await sendResendEmail({
      apiKey: apiKey!,
      fromEmail,
      toEmail: email,
      subject,
      htmlContent: htmlBody,
      allowDevFallback: isDev,
    });

    if (sent) {
      totalSent++;
      await recordWeeklyDigestSent(firestore, dispatchId, email);
    }
  }

  console.log(`Weekly digest dispatch complete. Sent ${totalSent} digest email(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  runDispatchWeeklyDigest({
    testEmail: getArg('--test-email'),
    dryRun: args.includes('--dry-run'),
    days: getArg('--days') ? parseInt(getArg('--days')!, 10) : undefined,
    project: getArg('--project'),
    database: getArg('--database'),
    fromEmail: getArg('--from-email'),
  }).catch((err) => {
    console.error('Fatal dispatch_weekly_digest error:', err);
    process.exit(1);
  });
}
