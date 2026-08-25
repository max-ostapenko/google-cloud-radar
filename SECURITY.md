# Security Policy

Google Cloud Radar takes the security and integrity of its services, infrastructure, and user community seriously. We welcome responsible disclosure of potential security vulnerabilities.

---

## Supported Components

The following active components are in scope for security updates:

| Component | Scope / Target | Status |
|---|---|---|
| **Web Application** | [`https://google-cloud-radar.com`](https://google-cloud-radar.com) / `web/` | Supported |
| **Ingestion Pipeline** | `scripts/*.py` & GitHub Actions Workflows | Supported |
| **Cloud Infrastructure & Rules** | `terraform/` & `web/firestore.rules` | Supported |

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in Google Cloud Radar, please report it responsibly so we can investigate and address it before public disclosure.

### Reporting via GitHub Private Vulnerability Reporting
Please use GitHub's private vulnerability reporting feature:
1. Navigate to the repository's **[Security](../../security)** tab.
2. Click **Report a vulnerability** under **Advisories**.
3. Fill out the report details with a description and proof of concept (PoC).

This opens a confidential, private advisory workspace with the maintainers without exposing any personal contact information.

### What to Include
To help us triage and resolve the issue quickly, please include:
- **Component & URL**: The specific page, API endpoint, script, or configuration affected.
- **Description**: Clear description of the vulnerability and its potential impact.
- **Steps to Reproduce**: Detailed reproduction steps or a minimal Proof of Concept (PoC).
- **Remediation Suggestion**: Any recommended fixes or mitigation steps (if available).

---

## Our Commitment

When a security vulnerability is reported, we will:
1. **Acknowledge**: Respond to your report within **48 hours** to confirm receipt.
2. **Assess**: Triage the severity and scope within **5 business days**.
3. **Remediate**: Deploy a fix as quickly as possible and coordinate public disclosure timelines.
4. **Credit**: Acknowledge your contribution in the security advisory (unless you prefer anonymity).

---

## Security Architecture & Design Principles

Google Cloud Radar is built following defense-in-depth principles:

* **Zero Long-Lived CI/CD Keys**: All GitHub Actions workflows authenticate to Google Cloud via **Workload Identity Federation (WIF)** with short-lived OAuth access tokens and granular IAM roles.
* **Server-Enforced Firestore Security Rules**: Client writes are restricted to user-isolated subcollections (`/reactions/{userId}`) and field-level validated attributes (`reaction_counts`). Core discovery data cannot be altered from client browsers.
* **Deterministic AST Normalization**: Discovery JSON schemas are stripped of dynamic metadata noise and validated deterministically before LLM analysis to avoid prompt injection from upstream payloads.
* **Content & Origin Security**: Custom domains enforce `Cross-Origin-Opener-Policy: same-origin-allow-popups` and strict HTTPS HSTS headers.
