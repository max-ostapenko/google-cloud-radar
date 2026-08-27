#!/usr/bin/env python3
"""
Automated Canary -> GA Release Correlator for Google Cloud Radar.

Scans official Google Cloud release note RSS/Atom feeds, detects when an
unpublished Canary method or feature is officially documented, calculates
the lead time (in days), and updates the JSON records and Firestore documents.
"""

import argparse
import datetime
import glob
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

try:
    from scripts.taxonomy import get_release_feed_url, get_official_release_feeds
except ImportError:
    from taxonomy import get_release_feed_url, get_official_release_feeds

OFFICIAL_RELEASE_FEEDS = get_official_release_feeds()

_FEED_CACHE: dict[str, list] = {}


def fetch_feed_entries(feed_url: str) -> list:
    """Fetches and parses an RSS/Atom release notes feed, caching results per run."""
    if feed_url in _FEED_CACHE:
        return _FEED_CACHE[feed_url]

    req = urllib.request.Request(
        feed_url,
        headers={"User-Agent": "GCP-Discovery-Radar/1.0 (+https://gcp-cloud-radar.web.app)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_text = resp.read().decode("utf-8")
        entries = parse_feed_xml(xml_text)
        _FEED_CACHE[feed_url] = entries
        return entries
    except Exception as e:
        print(f"⚠️ Could not fetch release feed from {feed_url}: {e}", file=sys.stderr)
        _FEED_CACHE[feed_url] = []
        return []


def parse_feed_xml(xml_text: str) -> list:
    """Parses XML string into a list of release entries (title, link, published_date, content)."""
    entries = []
    try:
        root = ET.fromstring(xml_text)
        m = re.match(r"\{([^}]+)\}", root.tag)
        ns_uri = m.group(1) if m else ""
        ns = {"atom": ns_uri} if ns_uri else {}

        atom_entries = root.findall("atom:entry", ns) if ns else root.findall("entry")
        if not atom_entries:
            atom_entries = root.findall(".//{http://www.w3.org/2005/Atom}entry") or root.findall(".//entry")

        for entry in atom_entries:
            title = entry.find("atom:title", ns) if ns else entry.find("title")
            if title is None:
                title = entry.find(".//{http://www.w3.org/2005/Atom}title") or entry.find(".//title")
            title_text = title.text.strip() if title is not None and title.text else ""

            link_elem = entry.find("atom:link", ns) if ns else entry.find("link")
            link_url = ""
            if link_elem is not None:
                link_url = link_elem.attrib.get("href") or link_elem.text or ""

            pub_elem = None
            for tag in ["atom:updated", "atom:published", "updated", "published"]:
                candidate = entry.find(tag, ns) if (ns and tag.startswith("atom:")) else entry.find(tag)
                if candidate is not None and candidate.text:
                    pub_elem = candidate
                    break
            pub_date = pub_elem.text.strip() if pub_elem is not None and pub_elem.text else ""

            content_elem = None
            for tag in ["atom:content", "atom:summary", "content", "summary"]:
                candidate = entry.find(tag, ns) if (ns and tag.startswith("atom:")) else entry.find(tag)
                if candidate is not None and candidate.text:
                    content_elem = candidate
                    break
            content_text = content_elem.text.strip() if content_elem is not None and content_elem.text else ""

            if title_text or content_text:
                entries.append({
                    "title": title_text,
                    "url": link_url,
                    "date": pub_date[:10],
                    "content": content_text
                })
    except Exception as e:
        print(f"⚠️ XML parse error: {e}", file=sys.stderr)

    return entries


def calculate_lead_time(canary_date_str: str, release_date_str: str) -> int:
    """Calculates lead time delta in days between discovery canary and official GA."""
    try:
        d1 = datetime.datetime.strptime(canary_date_str[:10], "%Y-%m-%d").date()
        d2 = datetime.datetime.strptime(release_date_str[:10], "%Y-%m-%d").date()
        delta = (d2 - d1).days
        return max(0, delta)
    except Exception:
        return 14


def match_change_against_releases(change_meta: dict, release_entries: list) -> dict | None:
    """Matches a canary change entry against official release entries."""
    if not release_entries:
        return None

    title_words = set(re.findall(r"\w+", change_meta["title"].lower()))
    stop_words = {"a", "an", "the", "and", "or", "in", "on", "for", "with", "to", "api", "update", "new", "support"}
    significant_words = {w for w in title_words if len(w) > 3 and w not in stop_words}

    methods = [m.lower() for m in change_meta.get("extracted_methods", [])]

    for rel in release_entries:
        rel_text = f"{rel['title']} {rel['content']}".lower()

        # 1. Exact RPC Method Match
        for method in methods:
            short_method = method.split(".")[-1]
            if short_method and len(short_method) > 4 and short_method in rel_text:
                return rel

        # 2. Significant Title Keywords Match
        if significant_words:
            matched_words = [w for w in significant_words if w in rel_text]
            if len(matched_words) >= 2 or (len(significant_words) == 1 and len(matched_words) == 1):
                return rel

    return None


def update_json_file(file_path: str, release_info: dict, lead_time_days: int) -> bool:
    """Updates a JSON change file with correlation status."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        data["status"] = "released"
        data["radar_ring"] = "adopt"
        data["lead_time_days"] = lead_time_days
        data["official_release_date"] = release_info["date"]
        data["official_release_notes_url"] = release_info.get("url", "")

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return True
    except Exception as e:
        print(f"⚠️ Error updating {file_path}: {e}", file=sys.stderr)
        return False


def update_firestore_release(project_id: str, database_id: str, slug: str, release_info: dict, lead_time_days: int, token: str) -> bool:
    """Updates release correlation fields directly on the Firestore document."""
    if not token or not project_id or not database_id:
        return False

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/changes/{slug}?updateMask.fieldPaths=status&updateMask.fieldPaths=radar_ring&updateMask.fieldPaths=lead_time_days&updateMask.fieldPaths=official_release_date&updateMask.fieldPaths=official_release_notes_url&updateMask.fieldPaths=last_updated_at"
    
    rel_date = f"{release_info['date'][:10]}T00:00:00.000Z"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    fields = {
        "status": {"stringValue": "released"},
        "radar_ring": {"stringValue": "adopt"},
        "lead_time_days": {"integerValue": str(lead_time_days)},
        "official_release_date": {"timestampValue": rel_date},
        "official_release_notes_url": {"stringValue": release_info.get("url", "")},
        "last_updated_at": {"timestampValue": now_iso},
    }

    payload = json.dumps({"fields": fields}).encode("utf-8")
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
    except Exception as e:
        print(f"⚠️ Error updating Firestore for {slug}: {e}", file=sys.stderr)
        return False


def run_correlation(data_dir: str, custom_releases: dict | None = None, project_id: str = "", database_id: str = "", token: str = "") -> list:
    """Runs the correlation engine across all canary changes in data_dir."""
    files = sorted(glob.glob(os.path.join(data_dir, "*.json")))

    matched_results = []

    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        slug = data.get("slug") or data.get("id") or os.path.basename(file_path).replace(".json", "")
        if data.get("status") == "released":
            continue

        title = data.get("title") or slug
        first_detected = str(data.get("date") or slug[:10])[:10]
        extracted_methods = data.get("extracted_methods", [])

        change_meta = {
            "slug": slug,
            "title": title,
            "first_detected": first_detected,
            "extracted_methods": extracted_methods,
        }

        # Match against release feeds
        service_key = slug.split("-")[3] if len(slug.split("-")) > 3 else ""
        feed_url = get_release_feed_url(service_key) or OFFICIAL_RELEASE_FEEDS.get(service_key)
        release_entries = []
        if custom_releases and service_key in custom_releases:
            release_entries = custom_releases[service_key]
        elif feed_url:
            release_entries = fetch_feed_entries(feed_url)

        match = match_change_against_releases(change_meta, release_entries)
        if match:
            lead_time = calculate_lead_time(first_detected, match["date"])
            update_json_file(file_path, match, lead_time)
            if project_id and database_id and token:
                update_firestore_release(project_id, database_id, slug, match, lead_time, token)

            matched_results.append({
                "slug": slug,
                "lead_time_days": lead_time,
                "official_release_date": match["date"],
                "official_url": match.get("url", "")
            })
            print(f"🎯 Correlated! {slug} -> Officially released on {match['date']} (Lead time: {lead_time} days)")

    return matched_results


def main():
    parser = argparse.ArgumentParser(description="Correlate Canary changes with official Google Cloud release notes.")
    parser.add_argument("--data-dir", default="data/changes", help="Path to data/changes directory")
    parser.add_argument("--project", default="gcp-cloud-radar", help="GCP Project ID for Firestore sync")
    parser.add_argument("--database", default="radar", help="Firestore database ID")
    args = parser.parse_args()

    token = ""
    try:
        import subprocess
        token = subprocess.check_output(["gcloud", "auth", "print-access-token", "--quiet"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        pass

    print(f"📡 Starting Canary -> GA Release Correlator on '{args.data_dir}'...")
    results = run_correlation(args.data_dir, project_id=args.project, database_id=args.database, token=token)
    print(f"✨ Finished! Correlated {len(results)} new releases.")


if __name__ == "__main__":
    main()
