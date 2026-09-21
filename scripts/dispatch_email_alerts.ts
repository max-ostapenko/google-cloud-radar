/**
 * Dispatches transactional email alerts to registered subscribers
 * when breaking changes or critical schema evolutions are detected.
 *
 * Supports Resend API with idempotency tracking in Cloud Firestore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CHANGES_DIR = path.join(DATA_DIR, 'changes');

// Load environment variables from .env if present
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

export const DEFAULT_GCP_PROJECT = 'gcp-cloud-radar';
export const DEFAULT_FIRESTORE_DB = 'radar';
export const RESEND_API_URL = 'https://api.resend.com/emails';
export const DEFAULT_FROM_EMAIL = 'Google Cloud Radar <alerts@google-cloud-radar.com>';
export const FALLBACK_SANDBOX_FROM_EMAIL = 'Google Cloud Radar <onboarding@resend.dev>';

export interface Subscriber {
  uid: string;
  email: string;
  all_services: boolean;
  watched_services: string[];
}

export interface SendEmailOptions {
  apiKey: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  allowDevFallback?: boolean;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function isDevEnvironment(): boolean {
  const env = (process.env.ENVIRONMENT || '').toLowerCase();
  if (['production', 'prod'].includes(env)) {
    return false;
  }
  const ci = (process.env.CI || '').toLowerCase();
  if (['true', '1'].includes(ci) || process.env.GITHUB_ACTIONS === 'true') {
    return false;
  }
  return true;
}

export async function sendResendEmail(options: SendEmailOptions): Promise<boolean> {
  const {
    apiKey,
    fromEmail,
    toEmail,
    subject,
    htmlContent,
    textContent,
    allowDevFallback = false,
  } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Google-Cloud-Radar-Dispatcher/1.0',
  };

  const payload: Record<string, any> = {
    from: fromEmail,
    to: [toEmail],
    subject,
    html: htmlContent,
  };
  if (textContent) {
    payload.text = textContent;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      console.log(`✓ Email successfully sent to ${toEmail} (Resend ID: ${data.id || 'N/A'})`);
      return true;
    }

    const errorMsg = await res.text();
    if (
      allowDevFallback &&
      (errorMsg.toLowerCase().includes('domain') || res.status === 403) &&
      fromEmail !== FALLBACK_SANDBOX_FROM_EMAIL
    ) {
      console.warn(
        `[DEV ENV] Domain in '${fromEmail}' is not yet verified in Resend. Retrying with '${FALLBACK_SANDBOX_FROM_EMAIL}' sandbox domain...`
      );
      return sendResendEmail({
        ...options,
        fromEmail: FALLBACK_SANDBOX_FROM_EMAIL,
        allowDevFallback: false,
      });
    }

    console.error(`✗ Resend API HTTP error sending to ${toEmail} (${res.status}): ${errorMsg}`);
    return false;
  } catch (err: any) {
    console.error(`✗ Failed to send email to ${toEmail}: ${err.message}`);
    return false;
  }
}

export function renderBreakingEmailHtml(change: Record<string, any>): string {
  const rawService = change.service || change.service_name || 'Google Cloud Service';
  const rawTitle = change.title || `${rawService} Breaking Change Detected`;
  const rawSummary = change.summary || '';
  const rawApi = change.api || '';
  const rawDate = change.date || new Date().toISOString().slice(0, 10);
  const rawSlug = String(change.slug || change.id || '');
  const extractedMethods: string[] = Array.isArray(change.extracted_methods)
    ? change.extracted_methods
    : [];
  const tags: string[] = Array.isArray(change.tags) ? change.tags : [];

  const serviceName = escapeHtml(String(rawService));
  const title = escapeHtml(String(rawTitle));
  const summary = escapeHtml(String(rawSummary));
  const api = escapeHtml(String(rawApi));
  const dateStr = escapeHtml(String(rawDate));
  const diffUrl = `https://google-cloud-radar.com/changes/${encodeURIComponent(rawSlug)}`;

  let methodsHtml = '';
  if (extractedMethods.length > 0) {
    const methodsItems = extractedMethods
      .slice(0, 8)
      .map(
        (m) =>
          `<li style="margin-bottom: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #b3261e;"><code>${escapeHtml(String(m))}</code></li>`
      )
      .join('');
    methodsHtml = `
        <div style="margin-top: 18px; margin-bottom: 18px; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e0e0e0; border-left: 4px solid #ea4335; border-radius: 6px;">
          <strong style="display: block; margin-bottom: 8px; font-size: 12px; color: #b3261e; text-transform: uppercase; letter-spacing: 0.5px;">Impacted Methods &amp; Schema Elements:</strong>
          <ul style="margin: 0; padding-left: 20px;">
            ${methodsItems}
          </ul>
        </div>
        `;
  }

  const tagsHtml = tags
    .slice(0, 6)
    .map(
      (t) =>
        `<span style="display: inline-block; background-color: #f1f3f4; color: #5f6368; border: 1px solid #e8eaed; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; font-family: ui-monospace, Menlo, monospace;">#${escapeHtml(String(t))}</span>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Breaking Alert: ${serviceName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #202124; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dadce0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <!-- Header Branding -->
          <tr>
            <td style="padding: 20px 24px; background-color: #202124; border-bottom: 1px solid #3c4043;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 16px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">
                      Google Cloud <span style="color: #8ab4f8;">Radar</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="background-color: rgba(234,67,53,0.2); color: #f28b82; border: 1px solid #ea4335; padding: 3px 8px; border-radius: 12px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      ⚠️ Breaking Alert
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 24px;">
              <!-- Meta Row -->
              <div style="font-size: 12.5px; color: #5f6368; margin-bottom: 8px;">
                <strong style="color: #1a73e8; font-size: 13.5px;">${serviceName}</strong> &nbsp;•&nbsp; <code style="font-family: monospace; background: #f1f3f4; padding: 2px 6px; border-radius: 4px;">${api}</code> &nbsp;•&nbsp; ${dateStr}
              </div>

              <!-- Title -->
              <h1 style="font-size: 20px; font-weight: 700; color: #202124; margin: 0 0 14px 0; line-height: 1.35; letter-spacing: -0.2px;">
                ${title}
              </h1>

              <!-- Summary -->
              <p style="font-size: 14.5px; color: #3c4043; line-height: 1.55; margin: 0 0 16px 0;">
                ${summary}
              </p>

              <!-- Extracted Methods -->
              ${methodsHtml}

              <!-- Tags -->
              <div style="margin-top: 14px; margin-bottom: 24px;">
                ${tagsHtml}
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 24px; margin-bottom: 12px;">
                <a href="${diffUrl}" target="_blank" style="display: inline-block; background-color: #1a73e8; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; box-shadow: 0 1px 3px rgba(26,115,232,0.3);">
                  View Full AST Diff & Impact Analysis →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 24px; background-color: #f8f9fa; border-top: 1px solid #dadce0; text-align: center; font-size: 12px; color: #70757a;">
              You received this automated notification because you subscribed to instant breaking change alerts on <a href="https://google-cloud-radar.com" style="color: #1a73e8; text-decoration: none;">Google Cloud Radar</a>.<br><br>
              <a href="https://google-cloud-radar.com/?action=alerts" style="color: #5f6368; text-decoration: underline;">Manage Alert Preferences</a> &nbsp;|&nbsp; <a href="https://google-cloud-radar.com/?impact=breaking" style="color: #5f6368; text-decoration: underline;">View All Breaking Alerts</a>
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

export function isServiceWatched(
  subscriber: {
    all_services?: boolean;
    allServices?: boolean;
    watched_services?: string[];
    watchedServices?: string[];
  },
  serviceSlug: string
): boolean {
  const allServices = subscriber.all_services ?? subscriber.allServices ?? true;
  if (allServices) {
    return true;
  }
  const watched = subscriber.watched_services ?? subscriber.watchedServices ?? [];
  return watched.includes(serviceSlug);
}

export async function fetchFirestoreSubscribers(
  projectId: string = DEFAULT_GCP_PROJECT,
  databaseId: string = DEFAULT_FIRESTORE_DB
): Promise<Subscriber[]> {
  try {
    const firestore = new Firestore({ projectId, databaseId: databaseId || '(default)' });
    const snapshot = await firestore.collection('users').get();
    const subscribers: Subscriber[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const email = data.email || '';
      const uid = data.uid || doc.id;
      const breakingAlerts = data.breakingAlerts ?? data.breaking_alerts ?? true;
      const allServices = data.allServices ?? data.all_services ?? true;
      const watchedServices = Array.isArray(data.watchedServices)
        ? data.watchedServices
        : Array.isArray(data.watched_services)
        ? data.watched_services
        : [];

      if (email && breakingAlerts) {
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

export async function hasAlertBeenSent(
  firestore: Firestore,
  slug: string,
  email: string
): Promise<boolean> {
  const docId = `${slug}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
  try {
    const doc = await firestore.collection('sent_alerts').doc(docId).get();
    return doc.exists;
  } catch {
    return false;
  }
}

export async function recordAlertSent(
  firestore: Firestore,
  slug: string,
  email: string
): Promise<void> {
  const docId = `${slug}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
  try {
    await firestore.collection('sent_alerts').doc(docId).set(
      {
        slug,
        email,
        sent_at: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.warn(`Could not record sent alert log in Firestore: ${err.message}`);
  }
}

export function loadBreakingChanges(slugFilter?: string, changesDir?: string): any[] {
  const dir = changesDir ? path.resolve(changesDir) : CHANGES_DIR;
  if (slugFilter) {
    const filePath = path.join(dir, `${slugFilter}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return [doc];
      } catch (err: any) {
        console.error(`Failed to read ${filePath}: ${err.message}`);
      }
    }
    return [];
  }

  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const changes: any[] = [];
  for (const f of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      if (doc.breaking === true) {
        changes.push(doc);
      }
    } catch {
      // ignore parse errors
    }
  }

  changes.sort((a, b) => {
    const dateComp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateComp !== 0) return dateComp;
    return String(b.slug || '').localeCompare(String(a.slug || ''));
  });

  return changes;
}

export async function runDispatchEmailAlerts(options?: {
  resendApiKey?: string;
  fromEmail?: string;
  testEmail?: string;
  slug?: string;
  project?: string;
  database?: string;
  dryRun?: boolean;
}): Promise<void> {
  const apiKey = options?.resendApiKey || process.env.RESEND_API_KEY;
  const rawFrom =
    options?.fromEmail?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_FROM_EMAIL;
  const fromEmail = rawFrom;
  const dryRun = Boolean(options?.dryRun);
  const projectId = options?.project || DEFAULT_GCP_PROJECT;
  const databaseId = options?.database || DEFAULT_FIRESTORE_DB;
  const testEmail = options?.testEmail;
  const slug = options?.slug;

  if (!apiKey && !dryRun) {
    console.error('Missing RESEND_API_KEY environment variable or --resend-api-key flag.');
    console.info('Tip: Get your free Resend key at https://resend.com and pass RESEND_API_KEY=re_...');
    process.exit(1);
  }

  // 1. Load target breaking change(s)
  const breakingChanges = loadBreakingChanges(slug);
  if (breakingChanges.length === 0) {
    console.log('No breaking changes found to dispatch.');
    return;
  }

  const targetChanges = slug ? breakingChanges : breakingChanges.slice(0, 3);
  console.log(`Loaded ${targetChanges.length} breaking change(s) for evaluation.`);

  // 2. Test mode dispatch
  if (testEmail) {
    const testChange = targetChanges[0];
    const serviceName =
      testChange.service || testChange.service_name || 'Google Cloud';
    const subject = `⚠️ [Breaking Alert] ${serviceName}: ${testChange.title}`;
    const htmlBody = renderBreakingEmailHtml(testChange);

    console.log(`Dispatching TEST EMAIL to ${testEmail} for change: ${testChange.slug}`);
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
      console.log('🎉 Test email dispatched successfully!');
    } else {
      process.exit(1);
    }
    return;
  }

  // 3. Production subscriber loop
  const subscribers = await fetchFirestoreSubscribers(projectId, databaseId);
  console.log(`Found ${subscribers.length} active breaking change subscriber(s) in Firestore.`);

  if (subscribers.length === 0 && !dryRun) {
    console.log('No subscribers currently registered in Firestore. Done.');
    return;
  }

  const firestore = new Firestore({ projectId, databaseId: databaseId || '(default)' });
  let totalSent = 0;
  const isDev = isDevEnvironment();

  for (const change of targetChanges) {
    const changeSlug = change.slug || change.id;
    if (typeof changeSlug !== 'string') {
      console.warn('Skipping change without a valid slug');
      continue;
    }
    const serviceSlug = (change.service || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const serviceName = change.service || change.service_name || 'Google Cloud';
    const subject = `⚠️ [Breaking Alert] ${serviceName}: ${change.title}`;
    const htmlBody = renderBreakingEmailHtml(change);

    for (const sub of subscribers) {
      const email = sub.email;
      if (!isServiceWatched(sub, serviceSlug)) {
        continue;
      }

      if (await hasAlertBeenSent(firestore, changeSlug, email)) {
        continue;
      }

      if (dryRun) {
        console.log(`[DRY-RUN] Would send alert for ${changeSlug} to ${email}`);
        continue;
      }

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
        await recordAlertSent(firestore, changeSlug, email);
      }
    }
  }

  console.log(`Email dispatch complete. Sent ${totalSent} alert email(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  runDispatchEmailAlerts({
    resendApiKey: getArg('--resend-api-key'),
    fromEmail: getArg('--from-email'),
    testEmail: getArg('--test-email'),
    slug: getArg('--slug'),
    project: getArg('--project'),
    database: getArg('--database'),
    dryRun: args.includes('--dry-run'),
  }).catch((err) => {
    console.error('Fatal dispatch_email_alerts error:', err);
    process.exit(1);
  });
}
