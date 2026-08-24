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


SERVICE_CATEGORY_MAP = {
    "aiplatform": "AI & Machine Learning",
    "vertex": "AI & Machine Learning",
    "bigquery": "Data Platform",
    "biglake": "Data Platform",
    "bigqueryconnection": "Data Platform",
    "bigquerydatapolicy": "Data Platform",
    "bigquerydatatransfer": "Data Platform",
    "bigqueryreservation": "Data Platform",
    "datacatalog": "Data Platform",
    "dataform": "Data Platform",
    "datalineage": "Data Platform",
    "dataplex": "Data Platform",
    "datapipelines": "Data Platform",
    "analyticshub": "Data Platform",
    "discovery": "DevOps & Discovery",
    "billingbudgets": "FinOps & Billing",
    "cloudbilling": "FinOps & Billing",
    "appoptimize": "FinOps & Billing",
    "chromeuxreport": "Analytics & Web",
    "pagespeedonline": "Analytics & Web",
    "searchconsole": "Analytics & Web",
    "tagmanager": "Analytics & Web",
    "safebrowsing": "Core & Other",
    "webrisk": "Core & Other",
}

QUADRANT_MAP = {
    "AI & Machine Learning": "ai_ml",
    "Data Platform": "data_platforms",
    "DevOps & Discovery": "infra_compute",
    "FinOps & Billing": "security_finops",
    "Analytics & Web": "data_platforms",
    "Core & Other": "infra_compute",
}


def slugify(text: str) -> str:
    """Converts a service name or string to a lowercase URL-friendly slug."""
    text = re.sub(r"[^a-zA-Z0-9\s-]", "", text.strip())
    return re.sub(r"[\s_-]+", "-", text).lower()


def get_category_for_service(service_or_api: str) -> str:
    """Classifies a service or API into a standardized category."""
    lower = service_or_api.lower()
    for key, category in SERVICE_CATEGORY_MAP.items():
        if key in lower:
            return category
    return "Core & Other"


def determine_radar_ring(status: str, is_breaking: bool, version: str) -> str:
    """
    Maps API change attributes to Thoughtworks Tech Radar rings:
    - hold: deprecated / heavy breaking risk
    - assess: early canary pre-release signal
    - trial: public beta / preview / v1beta1
    - adopt: stable GA / released
    """
    status_lower = status.lower()
    if status_lower in ("deprecated", "retracted") or is_breaking:
        return "hold"
    if status_lower == "released":
        return "adopt"
    if "beta" in version.lower() or "alpha" in version.lower() or "preview" in version.lower():
        return "trial"
    return "assess"


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
        return token
    except Exception as e:
        print(f"⚠️ Warning: Could not retrieve access token: {e}", file=sys.stderr)
        return ""


def parse_markdown_file(file_path: str) -> dict:
    """Parses frontmatter and content from a feed markdown file into V2 Schema."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    meta = {}
    body = content

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body = parts[2].strip()
            for line in fm_text.strip().split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if v.lower() == "true":
                        meta[k] = True
                    elif v.lower() == "false":
                        meta[k] = False
                    elif v.isdigit():
                        meta[k] = int(v)
                    elif v.startswith("[") and v.endswith("]"):
                        items = [x.strip().strip('"').strip("'") for x in v[1:-1].split(",") if x.strip()]
                        meta[k] = items
                    else:
                        meta[k] = v

    slug = os.path.basename(file_path).replace(".md", "")
    service_name = meta.get("service") or meta.get("service_name") or meta.get("api") or "Google Cloud"
    service_id = slugify(service_name)
    api = meta.get("api") or slug.split("-", 3)[-1]
    version = api.split(".")[-1] if "." in api else "v1"
    date_str = str(meta.get("date") or slug[:10])[:10]
    title = meta.get("title") or f"{service_name} Update"
    impact = str(meta.get("impact", "medium")).lower()
    breaking = bool(meta.get("breaking", False))
    interesting_score = int(meta.get("interesting_score", 5))
    tags = meta.get("tags") if isinstance(meta.get("tags"), list) else [service_name, "Google Cloud"]
    status = str(meta.get("status", "canary")).lower()
    category = meta.get("category") or get_category_for_service(service_name)
    radar_ring = determine_radar_ring(status, breaking, version)
    radar_quadrant = QUADRANT_MAP.get(category, "infra_compute")

    # Extract methods
    method_matches = list(set(re.findall(r"`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`", body)))[:6]

    # Extract summary
    summary_match = re.search(r"## Summary\s*\n\n(.*?)(?=\n##|$)", body, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else body.split("\n\n")[0]

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
        "details_markdown": body,
        "impact": impact,
        "is_breaking": breaking,
        "interesting_score": interesting_score,
        "status": status,
        "radar_ring": radar_ring,
        "radar_quadrant": radar_quadrant,
        "radar_movement": "new",
        "tags": tags,
        "extracted_methods": method_matches,
        "first_detected_at": f"{date_str}T00:00:00.000Z",
        "last_updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "reaction_counts": {
            "impacts_prod": 0,
            "breaking_me": 0,
            "watch_ga": 0
        },
        "comments_count": 0
    }

    if "lead_time_days" in meta:
        doc["lead_time_days"] = int(meta["lead_time_days"])
    if "official_release_date" in meta:
        rel_date = str(meta["official_release_date"])[:10]
        doc["official_release_date"] = f"{rel_date}T00:00:00.000Z"
    if "official_release_notes_url" in meta:
        doc["official_release_notes_url"] = str(meta["official_release_notes_url"])

    return doc


def to_firestore_value(v):
    """Converts standard Python value to Firestore REST typed schema."""
    if isinstance(v, str):
        # Check if ISO Timestamp
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$", v):
            return {"timestampValue": v}
        return {"stringValue": v}
    elif isinstance(v, bool):
        return {"booleanValue": v}
    elif isinstance(v, int):
        return {"integerValue": str(v)}
    elif isinstance(v, float):
        return {"doubleValue": v}
    elif isinstance(v, list):
        return {
            "arrayValue": {
                "values": [to_firestore_value(item) for item in v]
            }
        }
    elif isinstance(v, dict):
        return {
            "mapValue": {
                "fields": {k: to_firestore_value(val) for k, val in v.items()}
            }
        }
    elif v is None:
        return {"nullValue": None}
    return {"stringValue": str(v)}


def to_firestore_fields(doc: dict) -> dict:
    """Converts dictionary to Firestore document fields representation."""
    return {k: to_firestore_value(v) for k, v in doc.items()}


def upload_to_firestore(project_id: str, database_id: str, doc: dict, token: str) -> bool:
    """Uploads a document to Cloud Firestore via REST API."""
    slug = doc["slug"]
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/changes/{slug}"

    payload = json.dumps({"fields": to_firestore_fields(doc)}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        print(f"⚠️ Error uploading {slug}: {e.code} - {e.read().decode('utf-8')}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"⚠️ Error uploading {slug}: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Upload and migrate feed changes to Google Cloud Firestore.")
    parser.add_argument("--project", default="gcp-cloud-radar", help="Google Cloud Project ID")
    parser.add_argument("--database", default="radar", help="Firestore Database ID (e.g. radar or (default))")
    parser.add_argument("--feed-dir", default="feed", help="Path to feed/ markdown directory")
    args = parser.parse_args()

    feed_files = sorted(glob.glob(os.path.join(args.feed_dir, "*.md")))
    feed_files = [f for f in feed_files if not f.endswith("README.md")]

    if not feed_files:
        print(f"⚠️ No markdown files found in {args.feed_dir}")
        sys.exit(1)

    print(f"🚀 Starting Firestore V2 migration to project '{args.project}' (database: '{args.database}')...")
    print(f"📄 Found {len(feed_files)} change records in {args.feed_dir}/\n")

    token = get_access_token()
    if not token:
        print("❌ Error: No valid GCP access token available. Authenticate with `gcloud auth application-default login` or `gcloud auth login`.", file=sys.stderr)
        sys.exit(1)

    success_count = 0

    for idx, file_path in enumerate(feed_files, 1):
        try:
            doc = parse_markdown_file(file_path)
            ok = upload_to_firestore(args.project, args.database, doc, token)
            if ok:
                success_count += 1
                status_icon = "⚠️" if doc["is_breaking"] else "✨"
                ring_badge = f"[{doc['radar_ring'].upper()}]"
                print(f"[{idx:02d}/{len(feed_files):02d}] {status_icon} {ring_badge} Upserted: {doc['slug']} ({doc['service_name']})")
        except Exception as e:
            print(f"[{idx:02d}/{len(feed_files):02d}] ❌ Failed {file_path}: {e}")

    print(f"\n🎉 Successfully migrated {success_count}/{len(feed_files)} changes to Cloud Firestore in {args.project} (database: '{args.database}')!")


if __name__ == "__main__":
    main()
