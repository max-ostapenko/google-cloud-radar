# 📡 Google Cloud Radar

> **Real-time pre-release intelligence for Google APIs and Cloud services.**  
> Tracking unreleased control-plane method additions, schema changes, and breaking changes directly from the Google API Discovery Service before they appear in official release notes.

---

## 🏗️ System Architecture

```mermaid
graph TD
    A[Google Discovery API] -->|Cron (every 5h)| B(scripts/update_disco.py)
    B -->|Check Whitelist| C{Is Monitored API?}
    C -->|Yes| D[Normalized JSON in discoveries/]
    
    D --> E(scripts/diff_to_feed.py)
    E -->|AST Diffing & Noise Filtering| F(scripts/diff_preprocessor.py)
    F --> G[Structured API Diff]
    
    G --> H(scripts/llm_client.py)
    H -->|Gemini 2.5/3 Pro Inference| I{Interesting Score >= 3?}
    I -->|Yes| J[Write to feed/*.md & feed/index.json]
    
    J --> K[Astro 5 SSG Web App / web/]
    K --> L[Firebase Hosting Global CDN]
    K --> M[Public Machine Feeds: /rss.xml, /api/feed.json, /llms.txt]
```

---

## 📁 Repository Layout

```
.
├── .github/workflows/
│   ├── update-disco.yml     # Cron (every 5h) pipeline: fetches Discovery JSON, analyzes with Gemini, commits to feed/
│   └── deploy-web.yml       # Push-to-main CI: builds Astro static site and deploys to Firebase Hosting
├── discoveries/             # Normalized Google Discovery JSON schemas (BigQuery, Vertex AI, Dataform, etc.)
├── feed/                    # Generated Markdown insights + index.json manifest
├── scripts/                 # Core Python Ingestion & Analysis Engine
│   ├── update_disco.py      # Pulls discovery docs from Google Discovery Service
│   ├── diff_preprocessor.py # Dot-notation AST flattener & noise-filter engine
│   ├── llm_client.py        # Gemini analysis client with retry & history context
│   ├── diff_to_feed.py      # Pipeline orchestrator
│   ├── feed_writer.py       # Writes frontmatter & markdown insights
│   └── prompts/             # System prompts for API change analyst
├── tests/                   # Pytest unit test suite (100% passing)
└── web/                     # Astro 5 + Firebase Web Application & Mock Database
    ├── src/                 # Google Developers / APIs Explorer styled UI
    ├── scripts/             # Lightweight Node.js Mock Firestore Server (Zero Java)
    ├── firebase.json        # Firebase Hosting & Emulator configuration
    └── README.md            # Web app & emulator documentation
```

---

## 🚀 Quick Start

### 1. Web Application & Live Radar Feed
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) to view the live changelog and radar feed.

### 2. Local Database & Mock Firestore Mode (Zero Java)
```bash
cd web
# Starts both Mock Firestore (port 8080) and Astro dev server (port 4321)
npm run dev:all
```

### 3. Running Python Pipeline Tests
```bash
pip install -r requirements.txt pytest
PYTHONPATH=. pytest
```

---

## 🤖 The Analysis Engine & Prompt Tuning

The Gemini-powered analysis prompt lives in [`scripts/prompts/api_change_analyst.txt`](file:///Users/maxostapenko/GitHub/discovery-artifact-manager/scripts/prompts/api_change_analyst.txt).

You can tune:
* **Tone & Persona**: Staff Cloud Infrastructure Architect
* **Scoring Threshold**: Insights scoring `< 3/10` are dropped
* **Breaking Change Heuristics**: Enum index modifications, required parameter additions, field renames

---

## 🚢 Deployment

The web app deploys automatically to Firebase Hosting on push to `main` via [.github/workflows/deploy-web.yml](file:///Users/maxostapenko/GitHub/discovery-artifact-manager/.github/workflows/deploy-web.yml).

Manual deployment:
```bash
cd web
npm run build
npx firebase-tools deploy --only hosting --project max-ostapenko
```

---

## 📄 License

Apache 2.0. Curated and engineered by [Max Ostapenko](https://maxostapenko.com).
