# Discovery & Analysis Scripts

Python tools for synchronizing Google Discovery documents, extracting AST diffs, performing Gemini impact analysis, and correlating public release notes.

---

## 🛠️ CLI Quick Reference

### 1. Diff Extraction & Feed Generation
```bash
# Preview AST diffs without calling Gemini or writing files
python scripts/diff_to_feed.py --dry-run

# Run against specific git refs
python scripts/diff_to_feed.py --base HEAD~2 --head HEAD

# Full run with Application Default Credentials (ADC)
python scripts/diff_to_feed.py
```

### 2. Release Note Correlation
```bash
# Correlate pre-release signals with official GCP release notes
python scripts/correlate_releases.py --project gcp-cloud-radar --database radar
```

### 3. Firestore Production Sync
```bash
# Sync data/changes/*.json entries into Cloud Firestore
python scripts/seed_prod_firestore.py --project gcp-cloud-radar --database radar
```

---

## 📂 Script Directory Map

| Script | Purpose |
|---|---|
| [`update_disco.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/update_disco.py) | Downloads and normalizes tracked Discovery documents from Google Discovery API. |
| [`diff_preprocessor.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/diff_preprocessor.py) | Flattens JSON schemas, strips metadata noise, and deterministically evaluates AIP-180 breaking rules. |
| [`diff_to_feed.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/diff_to_feed.py) | Pipeline orchestrator: extracts diffs, queries Vertex AI Gemini, and formats feed updates. |
| [`llm_client.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/llm_client.py) | Calls Vertex AI Gemini (`google-genai` SDK) using ADC / WIF credentials. |
| [`feed_writer.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/feed_writer.py) | Writes structured JSON change records to `data/changes/` and updates `data/index.json`. |
| [`correlate_releases.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/correlate_releases.py) | Scrapes public GCP release notes and computes empirical canary lead-time deltas. |
| [`seed_prod_firestore.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/seed_prod_firestore.py) | Upserts JSON change documents into Cloud Firestore. |
| [`taxonomy.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/taxonomy.py) | Curated GCP service categories, taxonomy groupings, and official documentation links. |
| [`open_pr.py`](file:///Users/maxostapenko/GitHub/google-cloud-radar/scripts/open_pr.py) | Automated pull request creation via GitHub CLI (`gh`). |

---

## 📄 Output Artifacts (`data/`)

`feed_writer.py` generates structured JSON documents in [`data/`](file:///Users/maxostapenko/GitHub/google-cloud-radar/data):

- `data/changes/YYYY-MM-DD-{service-api}.json`: Type-safe JSON record (`title`, `service`, `category`, `impact`, `breaking`, `extracted_methods`, `lead_time_days`, `summary`, `details`).
- `data/index.json`: Chronological, newest-first catalog consumed by the Astro web build, RSS generation, and API endpoints.

---

## 🧪 Testing

```bash
pytest tests/
python -m unittest discover tests
```
