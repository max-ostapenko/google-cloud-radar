#!/usr/bin/env python3
"""
Uploads all curated GCP Discovery change entries from feed/*.md
directly into Google Cloud Firestore (Native mode) via REST API.

Uses active gcloud credentials (`gcloud auth print-access-token`).
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error


def get_access_token() -> str:
    """Retrieves active OAuth2 access token via google-auth or gcloud CLI."""
    try:
        import google.auth
        import google.auth.transport.requests
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/datastore"])
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
    """Parses frontmatter and content from a feed markdown file."""
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
                        # Parse simple list
                        items = [x.strip().strip('"').strip("'") for x in v[1:-1].split(",") if x.strip()]
                        meta[k] = items
                    else:
                        meta[k] = v

    slug = os.path.basename(file_path).replace(".md", "")
    service = meta.get("service") or meta.get("service_name") or meta.get("api") or "Google Cloud"
    api = meta.get("api") or slug.split("-", 3)[-1]
    date_str = meta.get("date") or slug[:10]
    title = meta.get("title") or f"{service} Update"
    impact = str(meta.get("impact", "medium")).lower()
    breaking = bool(meta.get("breaking", False))
    interesting_score = int(meta.get("interesting_score", 5))
    tags = meta.get("tags") if isinstance(meta.get("tags"), list) else [service, "Google Cloud"]
    status = meta.get("status", "canary")

    # Extract methods
    method_matches = list(set(re.findall(r"`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`", body)))[:6]

    # Extract summary
    summary_match = re.search(r"## Summary\s*\n\n(.*?)(?=\n##|$)", body, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else body.split("\n\n")[0]

    return {
        "id": slug,
        "slug": slug,
        "service_name": service,
        "api": api,
        "category": meta.get("category", "Core & Other"),
        "title": title,
        "summary": summary,
        "details_markdown": body,
        "impact": impact,
        "is_breaking": breaking,
        "interesting_score": interesting_score,
        "status": status,
        "tags": tags,
        "extracted_methods": method_matches,
        "first_detected_at": f"{date_str}T00:00:00.000Z",
        "last_updated_at": f"{date_str}T00:00:00.000Z",
    }


def to_firestore_fields(doc: dict) -> dict:
    """Converts standard Python dictionary to Firestore REST schema."""
    fields = {}
    for k, v in doc.items():
        if isinstance(v, str):
            fields[k] = {"stringValue": v}
        elif isinstance(v, bool):
            fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fields[k] = {"integerValue": str(v)}
        elif isinstance(v, float):
            fields[k] = {"doubleValue": v}
        elif isinstance(v, list):
            fields[k] = {
                "arrayValue": {
                    "values": [{"stringValue": str(item)} for item in v]
                }
            }
        elif isinstance(v, dict):
            fields[k] = {"stringValue": json.dumps(v)}
    return fields


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
    parser = argparse.ArgumentParser(description="Upload feed changes to Google Cloud Firestore.")
    parser.add_argument("--project", default="max-ostapenko", help="Google Cloud Project ID")
    parser.add_argument("--database", default="radar", help="Firestore Database ID (e.g. radar or (default))")
    parser.add_argument("--feed-dir", default="feed", help="Path to feed/ markdown directory")
    args = parser.parse_args()

    feed_files = sorted(glob.glob(os.path.join(args.feed_dir, "*.md")))
    feed_files = [f for f in feed_files if not f.endswith("README.md")]

    if not feed_files:
        print(f"⚠️ No markdown files found in {args.feed_dir}")
        sys.exit(1)

    print(f"🚀 Starting Firestore upload to project '{args.project}' (database: '{args.database}')...")
    print(f"📄 Found {len(feed_files)} change records in {args.feed_dir}/\n")

    token = get_access_token()
    success_count = 0

    for idx, file_path in enumerate(feed_files, 1):
        try:
            doc = parse_markdown_file(file_path)
            ok = upload_to_firestore(args.project, args.database, doc, token)
            if ok:
                success_count += 1
                status_icon = "⚠️" if doc["is_breaking"] else "✨"
                print(f"[{idx:02d}/{len(feed_files):02d}] {status_icon} Upserted: {doc['slug']} ({doc['service_name']})")
        except Exception as e:
            print(f"[{idx:02d}/{len(feed_files):02d}] ❌ Failed {file_path}: {e}")

    print(f"\n🎉 Successfully uploaded {success_count}/{len(feed_files)} changes to Cloud Firestore in {args.project} (database: '{args.database}')!")


if __name__ == "__main__":
    main()
