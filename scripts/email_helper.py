#!/usr/bin/env python3
"""
Shared Email Helper for Google Cloud Radar.

Provides centralized functions for:
- Outbound email delivery via Resend API
- RFC 8058 compliant List-Unsubscribe and List-Unsubscribe-Post header construction
- Cryptographic HMAC token generation and verification for passwordless one-click unsubscribe
- Datastore subscription updates in Cloud Firestore
"""

import hashlib
import hmac
import json
import logging
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GCP_PROJECT = "gcp-cloud-radar"
DEFAULT_FIRESTORE_DB = "radar"
RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_EMAIL = "Google Cloud Radar <alerts@google-cloud-radar.com>"
FALLBACK_SANDBOX_FROM_EMAIL = "Google Cloud Radar <onboarding@resend.dev>"
DEFAULT_BASE_URL = "https://google-cloud-radar.com"
DEFAULT_HMAC_SECRET = "gcp-cloud-radar-unsubscribe-secret-v1"

logger = logging.getLogger("email_helper")


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


def is_dev_environment() -> bool:
    """Returns True if running locally in development rather than production CI."""
    if os.getenv("ENVIRONMENT", "").lower() in ("production", "prod"):
        return False
    if (
        os.getenv("CI", "").lower() in ("true", "1")
        or os.getenv("GITHUB_ACTIONS") == "true"
    ):
        return False
    return True


def get_access_token() -> str:
    """Retrieves active OAuth2 access token via gcloud CLI or google-auth ADC."""
    if is_dev_environment():
        try:
            token = subprocess.check_output(
                ["gcloud", "auth", "print-access-token", "--quiet"],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
            if token:
                return token
        except Exception:
            pass

    try:
        import google.auth  # type: ignore
        import google.auth.transport.requests  # type: ignore

        credentials, _ = google.auth.default(
            scopes=[
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/datastore",
            ]
        )
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
            stderr=subprocess.DEVNULL,
        ).strip()
        if token:
            return token
    except Exception:
        pass

    return ""


def get_unsubscribe_secret() -> str:
    """Retrieves secret key for HMAC token signing."""
    secret = os.getenv("UNSUBSCRIBE_SECRET") or os.getenv("RESEND_API_KEY")
    if secret and secret.strip():
        return secret.strip()
    return DEFAULT_HMAC_SECRET


def generate_unsubscribe_token(email: str, secret: Optional[str] = None) -> str:
    """Generates a cryptographic HMAC-SHA256 signature token for an email address."""
    key = (secret or get_unsubscribe_secret()).encode("utf-8")
    normalized_email = email.lower().strip().encode("utf-8")
    return hmac.new(key, normalized_email, hashlib.sha256).hexdigest()


def verify_unsubscribe_token(
    email: str, token: str, secret: Optional[str] = None
) -> bool:
    """Validates an unsubscribe HMAC token against the target email address."""
    if not email or not token:
        return False
    expected = generate_unsubscribe_token(email, secret=secret)
    return hmac.compare_digest(expected.lower(), token.strip().lower())


def generate_unsubscribe_url(
    email: str,
    base_url: str = DEFAULT_BASE_URL,
    secret: Optional[str] = None,
) -> str:
    """Constructs the API endpoint URL for RFC 8058 automated one-click unsubscribe."""
    norm_email = email.lower().strip()
    tok = generate_unsubscribe_token(norm_email, secret=secret)
    encoded_email = urllib.parse.quote(norm_email)
    return f"{base_url.rstrip('/')}/api/unsubscribe?email={encoded_email}&token={tok}"


def generate_unsubscribe_page_url(
    email: str,
    base_url: str = DEFAULT_BASE_URL,
    secret: Optional[str] = None,
) -> str:
    """Constructs the browser web page URL for footer link unsubscribe clicks."""
    norm_email = email.lower().strip()
    tok = generate_unsubscribe_token(norm_email, secret=secret)
    encoded_email = urllib.parse.quote(norm_email)
    return f"{base_url.rstrip('/')}/unsubscribe?email={encoded_email}&token={tok}"


def get_unsubscribe_headers(
    email: str,
    base_url: str = DEFAULT_BASE_URL,
    secret: Optional[str] = None,
) -> Dict[str, str]:
    """Generates RFC 8058 List-Unsubscribe and List-Unsubscribe-Post email headers."""
    api_url = generate_unsubscribe_url(email, base_url=base_url, secret=secret)
    return {
        "List-Unsubscribe": f"<{api_url}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


def send_resend_email(
    api_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    allow_dev_fallback: bool = False,
    headers: Optional[Dict[str, str]] = None,
    base_url: str = DEFAULT_BASE_URL,
) -> bool:
    """Sends an email via Resend REST API, injecting RFC 8058 headers automatically."""
    req_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Google-Cloud-Radar-Dispatcher/1.0",
    }

    # Auto-generate RFC 8058 unsubscribe headers if not explicitly supplied
    email_headers = dict(headers) if headers else {}
    if "List-Unsubscribe" not in email_headers:
        rfc_headers = get_unsubscribe_headers(to_email, base_url=base_url)
        email_headers.update(rfc_headers)

    payload: Dict[str, Any] = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_content,
        "headers": email_headers,
    }
    if text_content:
        payload["text"] = text_content

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        RESEND_API_URL, data=data, headers=req_headers, method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)
            logger.info(
                f"✓ Email successfully sent to {to_email} (Resend ID: {result.get('id', 'N/A')})"
            )
            return True
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        if (
            allow_dev_fallback
            and ("domain" in error_msg.lower() or e.code == 403)
            and from_email != FALLBACK_SANDBOX_FROM_EMAIL
        ):
            logger.warning(
                f"[DEV ENV] Domain in '{from_email}' is not yet verified in Resend. Retrying with '{FALLBACK_SANDBOX_FROM_EMAIL}' sandbox domain..."
            )
            return send_resend_email(
                api_key=api_key,
                from_email=FALLBACK_SANDBOX_FROM_EMAIL,
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                allow_dev_fallback=False,
                headers=email_headers,
                base_url=base_url,
            )
        logger.error(
            f"✗ Resend API HTTP error sending to {to_email} ({e.code}): {error_msg}"
        )
        return False
    except Exception as e:
        logger.error(f"✗ Failed to send email to {to_email}: {e}")
        return False


def unsubscribe_user_in_firestore(
    email: str,
    project_id: str = DEFAULT_GCP_PROJECT,
    database_id: str = DEFAULT_FIRESTORE_DB,
    auth_token: Optional[str] = None,
) -> bool:
    """Updates user subscription flags in Firestore to disable breakingAlerts and weeklyDigest."""
    token = auth_token or get_access_token()
    norm_email = email.lower().strip()

    if not token:
        logger.warning(
            "No access token available to update Firestore subscription status."
        )
        return False

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/users"
    headers = {
        "Authorization": f"Bearer {token}",
        "x-goog-user-project": project_id,
    }
    req = urllib.request.Request(url, headers=headers)

    updated_any = False
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            for doc in docs:
                doc_name = doc.get("name", "")
                fields = doc.get("fields", {})
                doc_email = (
                    fields.get("email", {}).get("stringValue", "").lower().strip()
                )

                if doc_email == norm_email:
                    patch_url = f"https://firestore.googleapis.com/v1/{doc_name}?updateMask.fieldPaths=breakingAlerts&updateMask.fieldPaths=weeklyDigest"
                    patch_payload = {
                        "fields": {
                            "email": {
                                "stringValue": fields.get("email", {}).get(
                                    "stringValue", email
                                )
                            },
                            "breakingAlerts": {"booleanValue": False},
                            "weeklyDigest": {"booleanValue": False},
                        }
                    }
                    patch_data = json.dumps(patch_payload).encode("utf-8")
                    patch_headers = {
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "x-goog-user-project": project_id,
                    }
                    patch_req = urllib.request.Request(
                        patch_url,
                        data=patch_data,
                        headers=patch_headers,
                        method="PATCH",
                    )
                    with urllib.request.urlopen(patch_req, timeout=10):
                        logger.info(
                            f"Updated subscription flags to False for user document {doc_name}"
                        )
                        updated_any = True

            if not updated_any:
                # If no existing document matched, create a doc with email and disabled preferences
                safe_id = re.sub(r"[^a-zA-Z0-9]", "_", norm_email)
                create_url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/users?documentId=unsub_{safe_id}"
                create_payload = {
                    "fields": {
                        "email": {"stringValue": email},
                        "breakingAlerts": {"booleanValue": False},
                        "weeklyDigest": {"booleanValue": False},
                    }
                }
                create_data = json.dumps(create_payload).encode("utf-8")
                create_headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-goog-user-project": project_id,
                }
                create_req = urllib.request.Request(
                    create_url, data=create_data, headers=create_headers, method="POST"
                )
                with urllib.request.urlopen(create_req, timeout=10):
                    logger.info(f"Created unsubscribed user document for {email}")
                    updated_any = True

    except urllib.error.HTTPError as e:
        logger.error(
            f"HTTP error updating Firestore subscription: {e.code} - {e.read().decode('utf-8')}"
        )
        return False
    except Exception as e:
        logger.error(f"Failed to update subscription in Firestore: {e}")
        return False

    return updated_any
