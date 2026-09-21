/**
 * Thin client around the Gemini API for generating API change insights.
 *
 * Uses the `@google/genai` SDK with Vertex AI backend, authenticated via
 * Application Default Credentials (ADC).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROMPT_PATH = path.join(__dirname, 'prompts/api_change_analyst.txt');
export const MODEL = 'gemini-2.5-flash';

export function loadSystemPrompt(): string {
  if (fs.existsSync(PROMPT_PATH)) {
    return fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return 'You are an expert Google Cloud API change analyst.';
}

export function getProjectId(): string | null {
  if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT) {
    return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || null;
  }

  try {
    const adcPath = path.join(os.homedir(), '.config/gcloud/application_default_credentials.json');
    if (fs.existsSync(adcPath)) {
      const data = JSON.parse(fs.readFileSync(adcPath, 'utf-8'));
      if (data.quota_project_id) return data.quota_project_id;
      if (data.project_id) return data.project_id;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function analyzeApiDiff(
  diff: Record<string, any>,
  existingTodayContent?: string | null,
  recentHistoryContent?: string | null
): Promise<Record<string, any> | null> {
  const project = getProjectId();
  if (!project && !process.env.GEMINI_API_KEY) {
    console.warn(
      'No GCP project or GEMINI_API_KEY found. Run: gcloud config set project YOUR_PROJECT_ID ' +
        'or set GOOGLE_CLOUD_PROJECT env var. Skipping LLM analysis.'
    );
    return null;
  }

  let client: GoogleGenAI;
  try {
    if (project) {
      client = new GoogleGenAI({ vertexai: true, project, location: 'global' });
    } else {
      client = new GoogleGenAI({});
    }
  } catch (err: any) {
    console.warn(`Could not initialise Gemini client: ${err.message}`);
    return null;
  }

  const systemPrompt = loadSystemPrompt();

  const userPayload: Record<string, any> = { diff };
  if (existingTodayContent) {
    userPayload.existing_today_content = existingTodayContent;
  }
  if (recentHistoryContent) {
    userPayload.recent_history_content = recentHistoryContent;
  }

  const userMessage = JSON.stringify(userPayload, null, 2);
  const apiName = diff.api || 'unknown';
  console.info(`Sending diff for ${apiName} to Gemini (${MODEL}) ...`);

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const raw = (response.text || '').trim();
    if (!raw) return null;
    const result = JSON.parse(raw);
    console.info(
      `  → ${result.api}: score=${result.interesting_score}, ` +
        `impact=${result.impact}, breaking=${result.breaking}`
    );
    return result;
  } catch (err: any) {
    console.error(`Gemini call failed for ${apiName}: ${err.message}`);
    return null;
  }
}
