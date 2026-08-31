# Google Cloud Radar — AI Agent Context

Agent guidelines and engineering invariants for modifying Google Cloud Radar. For the overall system architecture diagram and repository layout, see [**`README.md`**](README.md).

---

## 🛡️ Core Invariants & Data Contracts

1. **AIP-180 Breaking Checks First**:
   - Always enforce deterministic [Google AIP-180](https://google.aip.dev/180) compatibility checks in [`scripts/diff_preprocessor.py`](scripts/diff_preprocessor.py) before invoking Gemini LLM analysis.
   - Breaking triggers: removed methods/resources, removed query/request parameters, newly introduced required fields, mutated parameter types or enum values.

2. **Named Firestore Database (`radar`)**:
   - The application strictly uses the named Firestore database **`radar`** (never `(default)`).
   - Enforced across Python scripts (`--database radar`), client SDK ([`web/src/lib/firebase.ts`](web/src/lib/firebase.ts)), and Terraform rules ([`terraform/firestore.rules`](terraform/firestore.rules)).

3. **Rolling 90-Day Benchmark Scope**:
   - Velocity rankings and lead times in [`web/src/lib/stats.ts`](web/src/lib/stats.ts) and `/stats` default to a trailing rolling 90-day window (`ROLLING_WINDOW_DAYS = 90`).

4. **Singleton Modals & Viewport Root Mounting**:
   - Modals ([`AlertsModal.astro`](web/src/components/AlertsModal.astro), [`ShareScoopModal.astro`](web/src/components/ShareScoopModal.astro)) are singletons mounted once at the viewport root in [`BaseLayout.astro`](web/src/layouts/BaseLayout.astro). Individual cards only emit trigger events or data attributes to prevent DOM duplication and layout shifts.

5. **CLI-First Philosophy**:
   - Prefer native CLI tools (`gcloud`, `gh`, `firebase`) via shell commands for speed, auth reuse, and token efficiency.

---

## 📂 Subsystem References

| Subsystem | Guide | Focus |
|---|---|---|
| **Data Pipeline** | [`scripts/README.md`](scripts/README.md) | Discovery sync, AST diffing, Gemini analysis, release correlation, and email dispatcher. |
| **Web Frontend** | [`web/README.md`](web/README.md) | Astro 5 static routes, MiniSearch engine, mock Firestore server (`dev:all`), and design tokens. |
| **Security & Policy** | [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure, auth posture, and security rules. |

