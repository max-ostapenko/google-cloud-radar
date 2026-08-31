#!/usr/bin/env python3
"""
Dispatches a curated weekly intelligence digest to registered subscribers
every Monday morning, summarizing pre-release Google API changes, breaking
changes, and new methods detected over the last 7 days.

Supports Resend API with idempotency tracking in Cloud Firestore.

Usage:
    # Test weekly digest dispatch to a specific email:
    python scripts/dispatch_weekly_digest.py --test-email dev@example.com

    # Dry run preview of the weekly digest for the last 7 days:
    python scripts/dispatch_weekly_digest.py --dry-run

    # Production execution in scheduled GitHub Action:
    python scripts/dispatch_weekly_digest.py --database radar
"""

import argparse
import datetime
import html
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
INDEX_PATH = DATA_DIR / "index.json"

DEFAULT_GCP_PROJECT = "gcp-cloud-radar"
DEFAULT_FIRESTORE_DB = "radar"
RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_EMAIL = "Google Cloud Radar <alerts@google-cloud-radar.com>"
FALLBACK_SANDBOX_FROM_EMAIL = "Google Cloud Radar <onboarding@resend.dev>"

logger = logging.getLogger("dispatch_weekly_digest")


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
        "User-Agent": "Google-Cloud-Radar-Digest/1.0"
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
            logger.info(f"✓ Digest email successfully sent to {to_email} (Resend ID: {result.get('id', 'N/A')})")
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
        logger.error(f"✗ Failed to send digest email to {to_email}: {e}")
        return False


def load_recent_changes(days: int = 7) -> list[dict]:
    """Loads changes from data/changes/ published within the last N days."""
    if not CHANGES_DIR.exists():
        logger.warning(f"Changes directory not found at {CHANGES_DIR}")
        return []

    cutoff_date = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    changes = []

    for file_path in sorted(CHANGES_DIR.glob("*.json"), reverse=True):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                doc = json.load(f)
                doc_date = doc.get("date", "")
                if doc_date >= cutoff_date:
                    changes.append(doc)
        except Exception as e:
            logger.warning(f"Failed to read change document {file_path}: {e}")

    # Fallback to latest changes if none in last N days (for dev preview / test runs)
    if not changes and CHANGES_DIR.exists():
        for file_path in sorted(CHANGES_DIR.glob("*.json"), reverse=True)[:10]:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    changes.append(json.load(f))
            except Exception:
                pass

    return changes


def render_weekly_digest_html(changes: list[dict], week_label: Optional[str] = None) -> str:
    """Renders a responsive, modern HTML email template for the weekly digest."""
    if not week_label:
        today = datetime.date.today()
        week_label = f"Week of {today.strftime('%B %d, %Y')}"

    total_changes = len(changes)
    breaking_changes = [c for c in changes if c.get("breaking")]
    non_breaking_changes = [c for c in changes if not c.get("breaking")]
    breaking_count = len(breaking_changes)
    non_breaking_count = len(non_breaking_changes)
    
    unique_services = set()
    total_methods = 0
    for c in changes:
        svc = c.get("service") or c.get("service_name")
        if svc:
            unique_services.add(svc)
        total_methods += len(c.get("extracted_methods") or [])

    services_count = len(unique_services)

    # Render Breaking Changes Highlight Section
    breaking_items_html = ""
    if breaking_changes:
        for c in breaking_changes[:5]:
            svc_name = html.escape(c.get("service") or c.get("service_name") or "Google Cloud")
            raw_title = c.get("title") or ""
            title = html.escape(raw_title)
            display_title = title if raw_title.lower().startswith(svc_name.lower()) else f"{svc_name}: {title}"
            slug = c.get("slug") or c.get("id") or ""
            summary = html.escape(c.get("summary") or "")
            reasons = c.get("breaking_reasons") or []
            reason_text = f" · <span style='color: #b3261e;'>{html.escape(reasons[0])}</span>" if reasons else ""

            breaking_items_html += f"""
            <div style="margin-bottom: 14px; padding: 14px 16px; background-color: #ffffff; border: 1px solid #e0e0e0; border-left: 4px solid #ea4335; border-radius: 6px;">
              <div style="margin-bottom: 6px;">
                <span style="display: inline-block; font-size: 10px; font-weight: 700; background-color: #fce8e6; color: #c5221f; border: 1px solid #fad2cf; padding: 2px 7px; border-radius: 4px; text-transform: uppercase;">
                  ⚠️ Breaking Change
                </span>
              </div>
              <h3 style="font-size: 14.5px; font-weight: 700; color: #202124; margin: 0 0 6px 0; line-height: 1.35;">
                <a href="https://google-cloud-radar.com/changes/{slug}" target="_blank" style="color: #202124; text-decoration: none;">
                  {display_title}
                </a>
              </h3>
              <p style="font-size: 12.5px; color: #474747; margin: 0 0 8px 0; line-height: 1.45;">
                {summary}{reason_text}
              </p>
              <a href="https://google-cloud-radar.com/changes/{slug}" target="_blank" style="font-size: 12px; font-weight: 600; color: #1a73e8; text-decoration: none;">
                View AST Diff &amp; Impact Analysis →
              </a>
            </div>
            """

    # Render Other Recent Updates Section (Sorted by impact - non-breaking only)
    impact_order = {"high": 0, "medium": 1, "low": 2}
    sorted_non_breaking = sorted(non_breaking_changes, key=lambda x: impact_order.get((x.get("impact") or "low").lower(), 3))

    regular_items_html = ""
    for c in sorted_non_breaking[:12]:
        svc_name = html.escape(c.get("service") or c.get("service_name") or "Google Cloud")
        api = html.escape(c.get("api") or "")
        title = html.escape(c.get("title") or "")
        slug = c.get("slug") or c.get("id") or ""
        summary = html.escape(c.get("summary") or "")
        impact = (c.get("impact") or "low").upper()
        
        if impact == "HIGH":
            badge_style = "background-color: #fef7e0; color: #b06000; border: 1px solid #fce8b2;"
        elif impact == "MEDIUM":
            badge_style = "background-color: #e8f0fe; color: #1967d2; border: 1px solid #d2e3fc;"
        else:
            badge_style = "background-color: #f1f3f4; color: #5f6368; border: 1px solid #dadce0;"

        badge_text = f"{impact} IMPACT"

        methods = c.get("extracted_methods") or []
        methods_chip = f"<span style='font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; background: #f1f3f4; color: #3c4043; padding: 2px 6px; border-radius: 4px; margin-left: 6px;'>+{len(methods)} methods</span>" if methods else ""

        regular_items_html += f"""
        <div style="padding: 16px 0; border-bottom: 1px solid #eeeeee;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;">
            <tr>
              <td style="font-size: 12px; color: #5f6368; vertical-align: middle;">
                <strong style="color: #202124;">{svc_name}</strong> &nbsp;•&nbsp; <code style="font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; color: #5f6368; background-color: #f8f9fa; padding: 2px 5px; border-radius: 3px; border: 1px solid #e8eaed;">{api}</code>{methods_chip}
              </td>
              <td align="right" style="vertical-align: middle;">
                <span style="font-size: 9.5px; font-weight: 700; {badge_style} padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px;">
                  {badge_text}
                </span>
              </td>
            </tr>
          </table>
          <h3 style="font-size: 14.5px; font-weight: 600; color: #1a73e8; margin: 0 0 6px 0; line-height: 1.4;">
            <a href="https://google-cloud-radar.com/changes/{slug}" target="_blank" style="color: #1a73e8; text-decoration: none;">
              {title}
            </a>
          </h3>
          <p style="font-size: 12.5px; color: #474747; line-height: 1.5; margin: 0;">
            {summary}
          </p>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Cloud Radar — Weekly Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #202124; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dadce0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <!-- Header Branding -->
          <tr>
            <td style="padding: 24px; background-color: #202124; border-bottom: 1px solid #3c4043;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">
                      Google Cloud <span style="color: #8ab4f8;">Radar</span>
                    </span>
                    <div style="font-size: 12px; color: #9aa0a6; margin-top: 4px;">
                      Pre-Release API Intelligence & Telemetry
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="background-color: rgba(66,133,244,0.2); color: #8ab4f8; border: 1px solid #4285f4; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                      Weekly Digest
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary Hero Banner -->
          <tr>
            <td style="padding: 20px 24px; background-color: #f1f3f4; border-bottom: 1px solid #dadce0;">
              <div style="font-size: 13px; font-weight: 700; color: #202124; margin-bottom: 8px;">
                📅 {week_label}
              </div>
              <div style="font-size: 12.5px; color: #5f6368; line-height: 1.5;">
                Detected <strong>{total_changes} updates</strong> across <strong>{services_count} Google Cloud services</strong>, including <strong>{breaking_count} breaking changes</strong> and <strong>{total_methods} new API methods</strong>.
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px;">
              {"<!-- Breaking Changes Section -->" if breaking_changes else ""}
              {f'''
              <div style="margin-bottom: 24px;">
                <h2 style="font-size: 14px; font-weight: 700; color: #b3261e; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
                  ⚠️ Breaking Changes ({breaking_count})
                </h2>
                {breaking_items_html}
              </div>
              ''' if breaking_changes else ''}

              <!-- Weekly Updates Stream (Non-breaking) -->
              {f'''
              <div>
                <h2 style="font-size: 14px; font-weight: 700; color: #202124; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
                  🚀 New Features & Schema Updates ({non_breaking_count})
                </h2>
                {regular_items_html}
              </div>
              ''' if regular_items_html else ''}

              <!-- CTA Hub -->
              <div style="text-align: center; margin-top: 28px; margin-bottom: 12px;">
                <a href="https://google-cloud-radar.com" target="_blank" style="display: inline-block; background-color: #1a73e8; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 1px 3px rgba(26,115,232,0.3);">
                  Explore Full Radar Feed →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 24px; background-color: #f8f9fa; border-top: 1px solid #dadce0; text-align: center; font-size: 12px; color: #70757a;">
              You received this weekly digest because you enabled email updates on <a href="https://google-cloud-radar.com" style="color: #1a73e8; text-decoration: none;">Google Cloud Radar</a>.<br><br>
              <a href="https://google-cloud-radar.com/?action=alerts" style="color: #5f6368; text-decoration: underline;">Manage Alert Preferences</a> &nbsp;|&nbsp; <a href="https://google-cloud-radar.com/stats" style="color: #5f6368; text-decoration: underline;">90-Day Cloud Velocity Benchmark</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def fetch_firestore_weekly_subscribers(
    project_id: str = DEFAULT_GCP_PROJECT,
    database_id: str = DEFAULT_FIRESTORE_DB
) -> list[dict]:
    """Queries Firestore `users` collection for subscribers who enabled weekly digests."""
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
                weekly_digest = fields.get("weeklyDigest", {}).get("booleanValue", True)
                all_services = fields.get("allServices", {}).get("booleanValue", True)
                
                watched_services = []
                array_val = fields.get("watchedServices", {}).get("arrayValue", {})
                for item in array_val.get("values", []):
                    if "stringValue" in item:
                        watched_services.append(item["stringValue"])

                if email and weekly_digest:
                    subscribers.append({
                        "uid": uid or email,
                        "email": email,
                        "all_services": all_services,
                        "watched_services": watched_services,
                    })
    except Exception as e:
        logger.warning(f"Failed to fetch Firestore subscribers: {e}")

    return subscribers


def filter_changes_for_subscriber(changes: list[dict], subscriber: dict) -> list[dict]:
    """Filters changes to match a subscriber's watched services."""
    if subscriber.get("all_services", True):
        return changes

    watched = set(subscriber.get("watched_services", []))
    matched = []
    for c in changes:
        raw_svc = (c.get("service") or c.get("service_name") or "").lower()
        slug = re.sub(r"[^a-z0-9]+", "-", raw_svc).strip("-")
        if slug in watched or any(w in slug for w in watched):
            matched.append(c)

    return matched


def has_weekly_digest_been_sent(
    project_id: str,
    database_id: str,
    dispatch_id: str,
    token: str
) -> bool:
    """Checks Firestore `alert_dispatches` collection to prevent duplicate weekly emails."""
    if not token:
        return False

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/alert_dispatches/{dispatch_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
    except Exception:
        pass

    return False


def record_weekly_digest_sent(
    project_id: str,
    database_id: str,
    dispatch_id: str,
    email: str,
    token: str
) -> None:
    """Records weekly dispatch in Firestore for idempotency tracking."""
    if not token:
        return

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/alert_dispatches?documentId={dispatch_id}"
    payload = {
        "fields": {
            "dispatch_id": {"stringValue": dispatch_id},
            "type": {"stringValue": "weekly_digest"},
            "recipient_email": {"stringValue": email},
            "sent_at": {"timestampValue": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        }
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201):
                logger.debug(f"Recorded weekly dispatch {dispatch_id} in Firestore.")
    except Exception as e:
        logger.warning(f"Failed to record weekly dispatch in Firestore: {e}")


def main():
    parser = argparse.ArgumentParser(description="Dispatch weekly intelligence digest emails.")
    parser.add_argument("--test-email", help="Send a test digest email to a single address and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Preview digest recipients and content without sending.")
    parser.add_argument("--days", type=int, default=7, help="Number of past days of changes to include (default: 7).")
    parser.add_argument("--project", default=DEFAULT_GCP_PROJECT, help="Google Cloud project ID.")
    parser.add_argument("--database", default=DEFAULT_FIRESTORE_DB, help="Firestore database ID (default: 'radar').")
    parser.add_argument("--from-email", default=DEFAULT_FROM_EMAIL, help="Sender email address.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    api_key = os.getenv("RESEND_API_KEY")
    if not api_key and not args.dry_run:
        logger.error("RESEND_API_KEY environment variable is missing. Cannot dispatch emails.")
        sys.exit(1)

    # 1. Load target weekly changes
    changes = load_recent_changes(days=args.days)
    if not changes:
        logger.info(f"No changes found in the last {args.days} days to include in digest.")
        sys.exit(0)

    today = datetime.date.today()
    iso_year, iso_week, _ = today.isocalendar()
    week_label = f"Week of {today.strftime('%B %d, %Y')}"
    subject = f"📬 [Weekly Radar] Google Cloud Pre-Release Intelligence ({week_label})"

    logger.info(f"Loaded {len(changes)} change(s) for the weekly digest.")

    # 2. Test mode dispatch
    if args.test_email:
        html_body = render_weekly_digest_html(changes, week_label=week_label)
        logger.info(f"Dispatching TEST WEEKLY DIGEST to {args.test_email} with {len(changes)} changes")

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
            logger.info("🎉 Test weekly digest dispatched successfully!")
        sys.exit(0 if success else 1)

    # 3. Production subscriber loop
    subscribers = fetch_firestore_weekly_subscribers(project_id=args.project, database_id=args.database)
    logger.info(f"Found {len(subscribers)} active weekly digest subscriber(s) in Firestore.")

    if not subscribers and not args.dry_run:
        logger.info("No weekly digest subscribers currently registered in Firestore. Done.")
        sys.exit(0)

    token = get_access_token()
    total_sent = 0
    is_dev = is_dev_environment()

    for sub in subscribers:
        email = sub["email"]
        sub_changes = filter_changes_for_subscriber(changes, sub)
        if not sub_changes:
            logger.debug(f"Skipping {email} (no changes matching watched services)")
            continue

        dispatch_id = f"weekly_{iso_year}_w{iso_week}_{re.sub(r'[^a-zA-Z0-9]', '_', email)}"

        if has_weekly_digest_been_sent(args.project, args.database, dispatch_id, token):
            logger.debug(f"Skipping {email} (weekly digest already sent for {dispatch_id})")
            continue

        if args.dry_run:
            logger.info(f"[DRY-RUN] Would send weekly digest ({len(sub_changes)} changes) to {email}")
            continue

        html_body = render_weekly_digest_html(sub_changes, week_label=week_label)
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
            record_weekly_digest_sent(args.project, args.database, dispatch_id, email, token)

    logger.info(f"Weekly digest dispatch complete. Sent {total_sent} digest email(s).")


if __name__ == "__main__":
    main()
