#!/usr/bin/env python3
"""
Uploads and migrates all curated Google Cloud Radar change entries
directly into Google Cloud Firestore (Native mode) via REST API.

Uses active gcloud credentials (`gcloud auth print-access-token`) or Application Default Credentials.
"""

import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

try:
    from scripts.taxonomy import (
        get_category_for_service,
        get_quadrant_for_service,
        determine_radar_ring,
        WATCHED_SERVICES,
    )
except ImportError:
    from taxonomy import (  # type: ignore[import-not-found, no-redef]
        get_category_for_service,
        get_quadrant_for_service,
        determine_radar_ring,
        WATCHED_SERVICES,
    )


def slugify(text: str) -> str:
    """Converts a service name or string to a lowercase URL-friendly slug."""
    text = re.sub(r"[^a-zA-Z0-9\s-]", "", text.strip())
    return re.sub(r"[\s_-]+", "-", text).lower()


def get_access_token() -> str:
    """Retrieves active OAuth2 access token via google-auth or gcloud CLI."""
    try:
        import google.auth
        import google.auth.transport.requests

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


def parse_json_change_file(file_path: str) -> dict:
    """Parses a structured JSON change document into Firestore Schema."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    slug = (
        data.get("slug")
        or data.get("id")
        or os.path.basename(file_path).replace(".json", "")
    )
    service_name = (
        data.get("service")
        or data.get("service_name")
        or data.get("api")
        or "Google Cloud"
    )
    service_id = slugify(service_name)
    api = data.get("api") or slug.split("-", 3)[-1]
    version = api.split(".")[-1] if "." in api else "v1"
    date_str = str(data.get("date") or slug[:10])[:10]
    title = data.get("title") or f"{service_name} Update"
    impact = str(data.get("impact", "medium")).lower()
    breaking = bool(data.get("breaking", False))
    interesting_score = int(data.get("interesting_score", 5))
    tags = (
        data.get("tags")
        if isinstance(data.get("tags"), list)
        else [service_name, "Google Cloud"]
    )
    status = str(data.get("status", "canary")).lower()
    category = data.get("category") or get_category_for_service(service_name)
    radar_ring = data.get("radar_ring") or determine_radar_ring(
        status, breaking, version
    )
    radar_quadrant = data.get("radar_quadrant") or get_quadrant_for_service(
        service_name
    )
    lead_time_days = data.get("lead_time_days") if status == "released" else None
    summary = data.get("summary", "")
    details = data.get("details", summary)
    extracted_methods = data.get("extracted_methods", [])

    created_iso = f"{date_str}T00:00:00.000Z"
    now_iso = (
        datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    )

    doc = {
        "id": slug,
        "slug": slug,
        "service_id": service_id,
        "service_name": service_name,
        "api": api,
        "version": version,
        "category": category,
        "title": title,
        "summary": summary,
        "details_markdown": details,
        "impact": impact,
        "is_breaking": breaking,
        "interesting_score": interesting_score,
        "status": status,
        "radar_ring": radar_ring,
        "radar_quadrant": radar_quadrant,
        "radar_movement": "new",
        "lead_time_days": lead_time_days,
        "first_detected_at": created_iso,
        "last_updated_at": now_iso,
        "tags": tags,
        "extracted_methods": extracted_methods,
        "reaction_counts": {"impacts_prod": 0, "breaking_me": 0, "watch_ga": 0},
        "comments_count": 0,
        "stats": json.dumps(
            {
                "views": 100 + (interesting_score * 45),
                "subscribers": 10 + (interesting_score * 3),
                "upvotes": 5 + (interesting_score * 2),
                "impacted_users_count": 2 if breaking else 0,
            }
        ),
    }

    if data.get("official_release_date"):
        doc["official_release_date"] = str(data["official_release_date"])
    if data.get("official_release_notes_url"):
        doc["official_release_notes_url"] = str(data["official_release_notes_url"])

    return doc


def to_firestore_value(v):
    """Encodes a Python scalar or nested structure into Firestore REST API Value type."""
    if isinstance(v, bool):
        return {"booleanValue": v}
    elif isinstance(v, int):
        return {"integerValue": str(v)}
    elif isinstance(v, float):
        return {"doubleValue": v}
    elif isinstance(v, str):
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$", v):
            return {"timestampValue": v}
        return {"stringValue": v}
    elif isinstance(v, list):
        return {"arrayValue": {"values": [to_firestore_value(x) for x in v]}}
    elif isinstance(v, dict):
        return {
            "mapValue": {"fields": {k: to_firestore_value(val) for k, val in v.items()}}
        }
    elif v is None:
        return {"nullValue": None}
    return {"stringValue": str(v)}


def to_firestore_fields(doc: dict) -> dict:
    """Converts dictionary to Firestore document fields representation."""
    return {k: to_firestore_value(v) for k, v in doc.items()}


def upload_to_firestore(
    project_id: str, database_id: str, doc: dict, token: str
) -> bool:
    """Uploads a document to Cloud Firestore via REST API."""
    slug = doc["slug"]
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/changes/{slug}"

    payload = json.dumps({"fields": to_firestore_fields(doc)}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        print(
            f"⚠️ Error uploading {slug}: {e.code} - {e.read().decode('utf-8')}",
            file=sys.stderr,
        )
        return False
    except Exception as e:
        print(f"⚠️ Error uploading {slug}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Upload and migrate JSON changes to Google Cloud Firestore."
    )
    parser.add_argument(
        "--project", default="gcp-cloud-radar", help="Google Cloud Project ID"
    )
    parser.add_argument(
        "--database",
        default="radar",
        help="Firestore Database ID (e.g. radar or (default))",
    )
    parser.add_argument(
        "--data-dir", default="data/changes", help="Path to data/changes directory"
    )
    args = parser.parse_args()

    change_files = sorted(glob.glob(os.path.join(args.data_dir, "*.json")))

    if not change_files:
        print(f"⚠️ No JSON files found in {args.data_dir}")
        sys.exit(1)

    print(
        f"🚀 Starting Firestore migration to project '{args.project}' (database: '{args.database}')..."
    )
    print(f"📄 Found {len(change_files)} change records in {args.data_dir}/\n")

    token = get_access_token()
    if not token:
        print(
            "❌ Error: No valid GCP access token available. Authenticate with `gcloud auth application-default login` or `gcloud auth login`.",
            file=sys.stderr,
        )
        sys.exit(1)

    success_count = 0

    for idx, file_path in enumerate(change_files, 1):
        try:
            doc = parse_json_change_file(file_path)
            ok = upload_to_firestore(args.project, args.database, doc, token)
            if ok:
                success_count += 1
                status_icon = "⚠️" if doc["is_breaking"] else "✨"
                ring_badge = f"[{doc['radar_ring'].upper()}]"
                print(
                    f"[{idx:02d}/{len(change_files):02d}] {status_icon} {ring_badge} Upserted: {doc['slug']} ({doc['service_name']})"
                )
        except Exception as e:
            print(f"[{idx:02d}/{len(change_files):02d}] ❌ Failed {file_path}: {e}")

    print(
        f"\n🎉 Successfully migrated {success_count}/{len(change_files)} changes to Cloud Firestore in {args.project} (database: '{args.database}')!"
    )


if __name__ == "__main__":
    main()
