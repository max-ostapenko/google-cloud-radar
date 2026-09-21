# Discovery & Analysis Scripts

TypeScript tools for synchronizing Google Discovery documents, extracting AST diffs, performing Gemini impact analysis, and correlating public release notes.

---

## 🛠️ CLI Quick Reference

All scripts are written in TypeScript and executed seamlessly via `tsx` or npm lifecycle scripts.

### 1. Discovery Sync & AST Diff Pipeline
```bash
# Download and normalize latest Google API Discovery documents
npm run update:disco

# Extract AST diffs, detect AIP-180 breaking changes, and generate feed entries
npm run diff:feed

# Dry run: preview AST diffs without writing files or calling LLM
npx tsx scripts/diff_to_feed.ts --dry-run
```

### 2. Release Note Correlation
```bash
# Correlate pre-release signals with official GCP release notes
npm run correlate -- --database radar
```

### 3. Cloud Firestore Production Sync
```bash
# Sync data/changes/*.json entries into Cloud Firestore via official @google-cloud/firestore SDK
npm run seed:firestore -- --project gcp-cloud-radar --database radar
```

### 4. Transactional Breaking Alert Dispatcher
```bash
# Test alert dispatch to a specific email
npm run alerts:email -- --test-email user@example.com --slug 2026-08-29-aiplatform-v1beta1

# Production run with Firestore subscriber query and deduplication
npm run alerts:email -- --project gcp-cloud-radar --database radar
```

### 5. Monday Weekly Intelligence Digest
```bash
# Test weekly digest dispatch for the last 7 days
npm run digest:weekly -- --test-email user@example.com

# Production scheduled run
npm run digest:weekly -- --project gcp-cloud-radar --database radar
```

### 6. Pull Request Automation
```bash
# Check git status, commit updates, push to fork, and open/automerge PR
npm run pr:open
```

---

## 📂 Script Directory Map

| Script | Purpose |
|---|---|
| [`update_disco.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/update_disco.ts) | Downloads and normalizes tracked Discovery documents from Google Discovery API. |
| [`diff_preprocessor.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/diff_preprocessor.ts) | Flattens JSON schemas, strips metadata noise, and deterministically evaluates AIP-180 breaking rules. |
| [`diff_to_feed.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/diff_to_feed.ts) | Pipeline orchestrator: extracts diffs, queries Vertex AI Gemini, and formats feed updates. |
| [`llm_client.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/llm_client.ts) | Calls Vertex AI Gemini (`@google/genai` SDK) using ADC / WIF credentials. |
| [`feed_writer.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/feed_writer.ts) | Writes structured JSON change records to `data/changes/` and updates `data/index.json`. |
| [`correlate_releases.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/correlate_releases.ts) | Parses public GCP RSS/Atom release notes and computes empirical canary lead-time deltas. |
| [`seed_prod_firestore.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/seed_prod_firestore.ts) | Upserts JSON change documents into Cloud Firestore with batching. |
| [`dispatch_email_alerts.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/dispatch_email_alerts.ts) | Dispatches personalized transactional breaking alerts via Resend API (`alerts@google-cloud-radar.com`). |
| [`dispatch_weekly_digest.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/dispatch_weekly_digest.ts) | Dispatches weekly Monday roundup of all new APIs, methods, and schema diffs. |
| [`taxonomy.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/taxonomy.ts) | Curated GCP service categories, taxonomy groupings, and official documentation links. |
| [`normalize_discovery.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/normalize_discovery.ts) | Stable key sorting and formatting utility for Discovery schemas. |
| [`open_pr.ts`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/open_pr.ts) | Automated pull request creation via GitHub CLI (`gh`). |

---

## 📄 Output Artifacts (`data/`)

`feed_writer.ts` generates structured JSON documents in [`data/`](file:///Users/maxostapenko/GitHub/google-cloud-radar/data):

- `data/changes/YYYY-MM-DD-{service-api}.json`: Type-safe JSON record (`title`, `service`, `category`, `impact`, `breaking`, `extracted_methods`, `lead_time_days`, `summary`, `details`).
- `data/index.json`: Chronological, newest-first catalog consumed by the Astro web build, RSS generation, and API endpoints.

---

## 🧪 Testing & Quality Gates

```bash
# Run Vitest test suite across all scripts
npm test

# Watch mode during development
npm run test:watch

# TypeScript strict type checking
npm run typecheck
```
