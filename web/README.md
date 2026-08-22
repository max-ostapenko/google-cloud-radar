# Google Cloud Radar Web Frontend

The static frontend and developer intelligence platform for **Google Cloud Radar**, built with **Astro** and **Firebase**.

Modeled closely after Google Developers and the Google APIs Explorer design system.

---

## 🚀 Quick Start (Local Development)

### 1. Standard Web Development (Markdown Feed Mode)
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) to view the live radar feed.

---

## 🗄️ Local Database & Emulator (Zero-Secret Contributor Mode)

To develop and test database-driven features (status lifecycles, user voting, comments, notifications) without cloud credentials:

### 1. Start Firebase Emulators with Seed Data
```bash
# Starts local Firestore (port 8080) & Auth (port 9099) with test seed data
npm run emulators:seed
```

### 2. Emulator Endpoints & Web Studio
* **Astro Web UI**: [http://localhost:4321](http://localhost:4321)
* **Firebase Emulator Suite UI**: [http://localhost:4000](http://localhost:4000) (Inspect local Firestore records & Auth users)
* **Local Firestore Host**: `localhost:8080`
* **Local Auth Host**: `localhost:9099`

---

## 📊 Change Lifecycle & Status Model

Changes transition through four lifecycle states:

| Status | Meaning | UI Badge |
|---|---|---|
| `canary` | Detected in Google Discovery control plane; not yet in official release notes. | 🟡 `CANARY` |
| `released` | Confirmed published in official Google Cloud release notes. | 🟢 `RELEASED (X days lead time)` |
| `retracted` | Method appeared in Discovery and was removed before release. | ⚪ `RETRACTED` |
| `deprecated` | Existing API method or enum marked for shutdown. | 🔴 `DEPRECATED` |

---

## 🛠️ Project Structure

```
web/
├── src/
│   ├── components/       # Google APIs Explorer UI components
│   │   ├── ChangeCard.astro     # Feed card with status badges & RPC chips
│   │   ├── Header.astro         # GCP search, navigation & theme toggle
│   │   ├── Sidebar.astro        # Categorized Google services navigation
│   │   └── Footer.astro         # Machine feeds & creator attribution
│   ├── data/
│   │   └── seed_data.json       # Mock database fixtures for emulator
│   ├── layouts/
│   │   └── BaseLayout.astro     # SEO meta tags, JSON-LD, and responsive shell
│   ├── lib/
│   │   └── feed.ts              # Data parser with tolerant schema reader
│   ├── pages/
│   │   ├── index.astro          # Live Radar Feed & interactive filter pills
│   │   ├── breaking.astro       # Breaking changes watchdog
│   │   ├── changes/[slug].astro # Deep permalinks with RPC method chips
│   │   ├── services/[service].astro # Service hubs (Vertex AI, BigQuery, etc.)
│   │   ├── rss.xml.ts           # Global RSS 2.0 feed
│   │   ├── api/feed.json.ts     # JSON Feed 1.1 REST API
│   │   └── llms.txt.ts          # AI Agent / LLM discovery endpoint
│   └── styles/
│       └── global.css           # Google Cloud design system tokens & themes
├── scripts/
│   └── seed_firestore.js        # Script to populate Firestore emulator via REST
├── firebase.json                # Firebase Hosting & Emulator configuration
└── firestore.rules              # Database security rules
```

---

## 🚢 Production Deployment

To build and deploy to Firebase Hosting:
```bash
npm run build
npx firebase-tools deploy --only hosting --project max-ostapenko
```
