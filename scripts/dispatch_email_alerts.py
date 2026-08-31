#!/usr/bin/env python3
"""
Dispatches transactional email alerts to registered subscribers
when breaking changes or critical schema evolutions are detected.

Supports Resend API with idempotency tracking in Cloud Firestore.

Usage:
    # Send test email for a specific change slug:
    python scripts/dispatch_email_alerts.py --test-email max@example.com --slug 2026-08-30-aiplatform-v1beta1

    # Dry run across today's breaking changes:
    python scripts/dispatch_email_alerts.py --dry-run

    # Production run in CI pipeline:
    python scripts/dispatch_email_alerts.py
"""

import argparse
import datetime
import glob
import json
import logging
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Any

# Root path resolution
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
CHANGES_DIR = DATA_DIR / "changes"

DEFAULT_GCP_PROJECT = "gcp-cloud-radar"
DEFAULT_FIRESTORE_DB = "radar"
RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_EMAIL = "Google Cloud Radar <alerts@google-cloud-radar.com>"
FALLBACK_SANDBOX_FROM_EMAIL = "Google Cloud Radar <onboarding@resend.dev>"

logger = logging.getLogger("dispatch_email_alerts")


def load_env_file() -> None:
    """Loads key-value pairs from .env if present in root."""
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k not in os.environ:
                    os.environ[k] = v


load_env_file()


def get_access_token() -> str:
    """Retrieves active OAuth2 access token via google-auth or gcloud CLI."""
    try:
        import google.auth
        import google.auth.transport.requests
        credentials, _ = google.auth.default(scopes=[
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/datastore"
        ])
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        if credentials.token:
            return credentials.token
    except Exception:
        pass

    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token", "--quiet"],
            text=True,
            stderr=subprocess.DEVNULL
        ).strip()
        if token:
            return token
    except Exception:
        pass

    return ""


def is_dev_environment() -> bool:
    """Returns True if running locally in development rather than production CI."""
    if os.getenv("ENVIRONMENT", "").lower() in ("production", "prod"):
        return False
    if os.getenv("CI", "").lower() in ("true", "1") or os.getenv("GITHUB_ACTIONS") == "true":
        return False
    return True


def send_resend_email(
    api_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    allow_dev_fallback: bool = False
) -> bool:
    """Sends an email via Resend REST API."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Google-Cloud-Radar-Dispatcher/1.0"
    }

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }
    if text_content:
        payload["text"] = text_content

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(RESEND_API_URL, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)
            logger.info(f"✓ Email successfully sent to {to_email} (Resend ID: {result.get('id', 'N/A')})")
            return True
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        # Fallback to sandbox domain ONLY in development / test environment
        if allow_dev_fallback and ("domain" in error_msg.lower() or e.code == 403) and from_email != FALLBACK_SANDBOX_FROM_EMAIL:
            logger.warning(f"[DEV ENV] Domain in '{from_email}' is not yet verified in Resend. Retrying with '{FALLBACK_SANDBOX_FROM_EMAIL}' sandbox domain...")
            return send_resend_email(
                api_key=api_key,
                from_email=FALLBACK_SANDBOX_FROM_EMAIL,
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                allow_dev_fallback=False
            )
        logger.error(f"✗ Resend API HTTP error sending to {to_email} ({e.code}): {error_msg}")
        return False
    except Exception as e:
        logger.error(f"✗ Failed to send email to {to_email}: {e}")
        return False


def render_breaking_email_html(change: dict) -> str:
    """Renders a responsive, modern HTML email template for a breaking change alert."""
    service_name = change.get("service") or change.get("service_name") or "Google Cloud Service"
    title = change.get("title") or f"{service_name} Breaking Change Detected"
    summary = change.get("summary") or ""
    details = change.get("details") or summary
    api = change.get("api") or ""
    date_str = change.get("date") or datetime.date.today().isoformat()
    slug = change.get("slug") or change.get("id") or ""
    extracted_methods = change.get("extracted_methods") or []
    tags = change.get("tags") or []

    diff_url = f"https://google-cloud-radar.com/changes/{slug}"

    methods_html = ""
    if extracted_methods:
        methods_items = "".join(
            f'<li style="margin-bottom: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #b3261e;"><code>{m}</code></li>'
            for m in extracted_methods[:8]
        )
        methods_html = f"""
        <div style="margin-top: 18px; margin-bottom: 18px; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e0e0e0; border-left: 4px solid #ea4335; border-radius: 6px;">
          <strong style="display: block; margin-bottom: 8px; font-size: 12px; color: #b3261e; text-transform: uppercase; letter-spacing: 0.5px;">Impacted Methods &amp; Schema Elements:</strong>
          <ul style="margin: 0; padding-left: 20px;">
            {methods_items}
          </ul>
        </div>
        """

    tags_html = "".join(
        f'<span style="display: inline-block; background-color: #f1f3f4; color: #5f6368; border: 1px solid #e8eaed; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; font-family: ui-monospace, Menlo, monospace;">#{t}</span>'
        for t in tags[:6]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Breaking Alert: {service_name}</title>
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
                <strong style="color: #1a73e8; font-size: 13.5px;">{service_name}</strong> &nbsp;•&nbsp; <code style="font-family: monospace; background: #f1f3f4; padding: 2px 6px; border-radius: 4px;">{api}</code> &nbsp;•&nbsp; {date_str}
              </div>

              <!-- Title -->
              <h1 style="font-size: 20px; font-weight: 700; color: #202124; margin: 0 0 14px 0; line-height: 1.35; letter-spacing: -0.2px;">
                {title}
              </h1>

              <!-- Summary -->
              <p style="font-size: 14.5px; color: #3c4043; line-height: 1.55; margin: 0 0 16px 0;">
                {summary}
              </p>

              <!-- Extracted Methods -->
              {methods_html}

              <!-- Tags -->
              <div style="margin-top: 14px; margin-bottom: 24px;">
                {tags_html}
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 24px; margin-bottom: 12px;">
                <a href="{diff_url}" target="_blank" style="display: inline-block; background-color: #1a73e8; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; box-shadow: 0 1px 3px rgba(26,115,232,0.3);">
                  View Full AST Diff & Impact Analysis →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 24px; background-color: #f8f9fa; border-top: 1px solid #dadce0; text-align: center; font-size: 12px; color: #70757a;">
              You received this automated notification because you subscribed to instant breaking change alerts on <a href="https://google-cloud-radar.com" style="color: #1a73e8; text-decoration: none;">Google Cloud Radar</a>.<br><br>
              <a href="https://google-cloud-radar.com/?action=alerts" style="color: #5f6368; text-decoration: underline;">Manage Alert Preferences</a> &nbsp;|&nbsp; <a href="https://google-cloud-radar.com/breaking" style="color: #5f6368; text-decoration: underline;">View All Breaking Alerts</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def fetch_firestore_subscribers(
    project_id: str = DEFAULT_GCP_PROJECT,
    database_id: str = DEFAULT_FIRESTORE_DB
) -> list[dict]:
    """Queries Firestore `users` collection for subscribers who enabled breaking alerts."""
    token = get_access_token()
    if not token:
        logger.warning("No Google Cloud access token found. Cannot query Firestore subscribers.")
        return []

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/users"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    subscribers = []
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            for doc in docs:
                fields = doc.get("fields", {})
                email = fields.get("email", {}).get("stringValue", "")
                uid = fields.get("uid", {}).get("stringValue", "")
                breaking_alerts = fields.get("breakingAlerts", {}).get("booleanValue", True)
                all_services = fields.get("allServices", {}).get("booleanValue", True)
                
                watched_services = []
                array_val = fields.get("watchedServices", {}).get("arrayValue", {})
                for item in array_val.get("values", []):
                    if "stringValue" in item:
                        watched_services.append(item["stringValue"])

                if email and breaking_alerts:
                    subscribers.append({
                        "uid": uid or email,
                        "email": email,
                        "all_services": all_services,
                        "watched_services": watched_services,
                    })
    except Exception as e:
        logger.warning(f"Failed to fetch Firestore subscribers: {e}")

    return subscribers


def is_service_watched(subscriber: dict, service_slug: str) -> bool:
    """Checks if a subscriber wants alerts for a given service."""
    if subscriber.get("all_services", True):
        return True
    watched = subscriber.get("watched_services", [])
    return service_slug in watched


def has_alert_been_sent(
    project_id: str,
    database_id: str,
    slug: str,
    email: str,
    token: str
) -> bool:
    """Checks if an alert for this slug has already been sent to this email."""
    if not token:
        return False

    doc_id = f"{slug}_{re.sub(r'[^a-zA-Z0-9]', '_', email)}"
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/sent_alerts/{doc_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        return False
    except Exception:
        return False


def record_alert_sent(
    project_id: str,
    database_id: str,
    slug: str,
    email: str,
    token: str
) -> None:
    """Records that an alert was dispatched to prevent duplicate emails."""
    if not token:
        return

    doc_id = f"{slug}_{re.sub(r'[^a-zA-Z0-9]', '_', email)}"
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/sent_alerts/{doc_id}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    payload = {
        "fields": {
            "slug": {"stringValue": slug},
            "email": {"stringValue": email},
            "sent_at": {"timestampValue": now_iso},
        }
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="PATCH")

    try:
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception as e:
        logger.warning(f"Could not record sent alert log in Firestore: {e}")


def load_breaking_changes(slug_filter: Optional[str] = None) -> list[dict]:
    """Loads breaking change JSON documents from data/changes/."""
    changes = []
    if slug_filter:
        file_path = CHANGES_DIR / f"{slug_filter}.json"
        if file_path.exists():
            try:
                doc = json.loads(file_path.read_text(encoding="utf-8"))
                changes.append(doc)
            except Exception as e:
                logger.error(f"Failed to read {file_path}: {e}")
        return changes

    for fpath in glob.glob(str(CHANGES_DIR / "*.json")):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                doc = json.load(f)
                if doc.get("breaking") is True:
                    changes.append(doc)
        except Exception:
            continue

    # Sort newest first
    changes.sort(key=lambda c: (c.get("date", ""), c.get("slug", "")), reverse=True)
    return changes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dispatch email alerts to subscribers for Google Cloud Radar breaking changes."
    )
    parser.add_argument("--resend-api-key", default=os.getenv("RESEND_API_KEY"), help="Resend API key.")
    parser.add_argument("--from-email", default=os.getenv("RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL), help="Sender email.")
    parser.add_argument("--test-email", default=None, help="Send a single test email directly to this address.")
    parser.add_argument("--slug", default=None, help="Target specific change slug (e.g. 2026-08-30-aiplatform-v1beta1).")
    parser.add_argument("--project", default=os.getenv("GCP_PROJECT", DEFAULT_GCP_PROJECT), help="GCP Project ID.")
    parser.add_argument("--database", default=DEFAULT_FIRESTORE_DB, help="Firestore database name.")
    parser.add_argument("--dry-run", action="store_true", help="Print recipients and preview HTML without sending.")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s: %(message)s")

    api_key = args.resend_api_key
    if not api_key and not args.dry_run:
        logger.error("Missing RESEND_API_KEY environment variable or --resend-api-key flag.")
        logger.info("Tip: Get your free Resend key at https://resend.com and pass RESEND_API_KEY=re_...")
        sys.exit(1)

    # 1. Load target breaking change(s)
    breaking_changes = load_breaking_changes(args.slug)
    if not breaking_changes:
        logger.info("No breaking changes found to dispatch.")
        sys.exit(0)

    # If no specific slug was requested and not test email, target today's latest breaking change(s)
    target_changes = breaking_changes[:3] if not args.slug else breaking_changes
    logger.info(f"Loaded {len(target_changes)} breaking change(s) for evaluation.")

    # 2. Test mode dispatch
    if args.test_email:
        test_change = target_changes[0]
        service_name = test_change.get("service") or test_change.get("service_name") or "Google Cloud"
        subject = f"⚠️ [Breaking Alert] {service_name}: {test_change.get('title')}"
        html_body = render_breaking_email_html(test_change)

        logger.info(f"Dispatching TEST EMAIL to {args.test_email} for change: {test_change.get('slug')}")
        if args.dry_run:
            print(f"\n--- SUBJECT: {subject} ---")
            print(f"--- TO: {args.test_email} ---")
            print(f"--- FROM: {args.from_email} ---")
            print("--- HTML BODY PREVIEW (first 400 chars) ---")
            print(html_body[:400] + "...")
            sys.exit(0)

        is_dev = is_dev_environment()
        success = send_resend_email(
            api_key=api_key,
            from_email=args.from_email,
            to_email=args.test_email,
            subject=subject,
            html_content=html_body,
            allow_dev_fallback=is_dev or bool(args.test_email)
        )
        if success:
            logger.info("🎉 Test email dispatched successfully!")
        sys.exit(0 if success else 1)

    # 3. Production subscriber loop
    subscribers = fetch_firestore_subscribers(project_id=args.project, database_id=args.database)
    logger.info(f"Found {len(subscribers)} active breaking change subscriber(s) in Firestore.")

    if not subscribers and not args.dry_run:
        logger.info("No subscribers currently registered in Firestore. Done.")
        sys.exit(0)

    token = get_access_token()
    total_sent = 0
    is_dev = is_dev_environment()

    for change in target_changes:
        slug = change.get("slug") or change.get("id")
        service_slug = re.sub(r"[^a-z0-9]+", "-", (change.get("service") or "").lower()).strip("-")
        service_name = change.get("service") or change.get("service_name") or "Google Cloud"
        subject = f"⚠️ [Breaking Alert] {service_name}: {change.get('title')}"
        html_body = render_breaking_email_html(change)

        for sub in subscribers:
            email = sub["email"]
            if not is_service_watched(sub, service_slug):
                logger.debug(f"Skipping {email} (not watching {service_slug})")
                continue

            if has_alert_been_sent(args.project, args.database, slug, email, token):
                logger.debug(f"Skipping {email} for {slug} (already sent)")
                continue

            if args.dry_run:
                logger.info(f"[DRY-RUN] Would send alert for {slug} to {email}")
                continue

            sent = send_resend_email(
                api_key=api_key,
                from_email=args.from_email,
                to_email=email,
                subject=subject,
                html_content=html_body,
                allow_dev_fallback=is_dev
            )
            if sent:
                total_sent += 1
                record_alert_sent(args.project, args.database, slug, email, token)

    logger.info(f"Email dispatch complete. Sent {total_sent} alert email(s).")


if __name__ == "__main__":
    main()
