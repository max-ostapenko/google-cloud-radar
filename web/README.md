# Google Cloud Radar — Web Application

The frontend and developer intelligence platform for **Google Cloud Radar**, built with **Astro 5** and **Firebase**. Styled with curated vanilla CSS tokens matching Google Cloud design standards.

---

## 🚀 Local Development

### 1. Offline Mode (Static Feed Only)
Reads all feed entries and service catalogs directly from `feed/*.md` and `feed/index.json`:
```bash
npm install
npm run dev
```
Open [http://localhost:4321](http://localhost:4321).

### 2. Full Local Development (With Mock Firestore Server)
Runs Astro alongside a lightweight, zero-Java Node.js mock Firestore REST server on port `8080` for local comment/reaction testing:
```bash
npm run dev:all
```

---

## 🧭 Page Routes & Syndication

| Route | Purpose |
|---|---|
| `/` | Live Radar feed with interactive category filters, impact pills, and instant search (`/`). |
| `/stats` | Trailing 90-day rolling benchmark with velocity rankings, lead times, and breaking change rates. |
| `/breaking` | Dedicated triage radar for backwards-incompatible API changes. |
| `/services/[service]` | Service hub with historical change timeline, official docs, and raw Discovery REST endpoints. |
| `/changes/[slug]` | Deep permalinks with visual AST diffs, copyable RPC chips, social sharing, and discussions. |
| `/rss.xml` | Global RSS 2.0 feed for feed readers. |
| `/api/feed.json` | JSON Feed 1.1 REST API for programmatic consumption. |
| `/llms.txt` | Context-optimized feed for AI agents and LLMs. |

---

## 🛠️ Directory Structure

```
web/
├── src/
│   ├── components/       # UI components (ChangeCard, Header, Sidebar, Footer, ShareModal, etc.)
│   ├── layouts/          # BaseLayout (SEO meta, theme toggling, responsive grid shell)
│   ├── lib/              # Feed parser, stats aggregator, and Firebase client SDK
│   ├── pages/            # Astro static routes & machine-readable syndication endpoints
│   └── styles/           # Global design system tokens and Google Cloud theme variables
├── scripts/
│   ├── mock_db_server.js # Pure Node.js mock Firestore REST server (Zero Java)
│   └── seed_firestore.js # Seed script for local Firestore emulator
├── firebase.json         # Firebase Hosting & emulator configuration
└── firestore.rules       # Security rules for Cloud Firestore
```

---

## 🚢 Deployment

```bash
npm run build
npx firebase-tools deploy --only hosting --project gcp-cloud-radar
```
