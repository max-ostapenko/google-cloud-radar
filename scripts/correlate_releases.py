#!/usr/bin/env python3
"""
Automated Canary -> GA Release Correlator for Google Cloud Radar.

Scans official Google Cloud release note RSS/Atom feeds, detects when an
unpublished Canary method or feature is officially documented, calculates
the lead time (in days), and updates the feed markdown and Firestore records.
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


OFFICIAL_RELEASE_FEEDS = {
    "vertex-ai": "https://cloud.google.com/feeds/vertex-ai-release-notes.xml",
    "bigquery": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    "dataform": "https://cloud.google.com/feeds/dataform-release-notes.xml",
    "dataplex": "https://cloud.google.com/feeds/dataplex-release-notes.xml",
    "looker": "https://cloud.google.com/feeds/looker-release-notes.xml",
    "analytics-hub": "https://cloud.google.com/feeds/analytics-hub-release-notes.xml",
    "cloud-billing": "https://cloud.google.com/feeds/cloud-billing-release-notes.xml",
}


def fetch_feed_entries(feed_url: str) -> list:
    """Fetches and parses an RSS/Atom release notes feed."""
    req = urllib.request.Request(
        feed_url,
        headers={"User-Agent": "GCP-Discovery-Radar/1.0 (+https://gcp-discovery-radar.web.app)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_text = resp.read().decode("utf-8")
        return parse_feed_xml(xml_text)
    except Exception as e:
        print(f"⚠️ Could not fetch release feed from {feed_url}: {e}", file=sys.stderr)
        return []


def parse_feed_xml(xml_text: str) -> list:
    """Parses XML string into a list of release entries (title, link, published_date, content)."""
    entries = []
    try:
        root = ET.fromstring(xml_text)
        # Extract namespace if present
        m = re.match(r"\{([^}]+)\}", root.tag)
        ns_uri = m.group(1) if m else ""
        ns = {"atom": ns_uri} if ns_uri else {}

        # Handle Atom feed (<entry>)
        atom_entries = root.findall("atom:entry", ns) if ns else root.findall("entry")
        if not atom_entries:
            atom_entries = root.findall(".//{http://www.w3.org/2005/Atom}entry") or root.findall(".//entry")

        for entry in atom_entries:
            title = entry.find("atom:title", ns) if ns else entry.find("title")
            if title is None:
                title = entry.find(".//{http://www.w3.org/2005/Atom}title") or entry.find(".//title")
            title_text = title.text.strip() if title is not None and title.text else ""

            link_elem = entry.find("atom:link", ns) if ns else entry.find("link")
            if link_elem is None:
                link_elem = entry.find(".//{http://www.w3.org/2005/Atom}link") or entry.find(".//link")
            link_href = link_elem.attrib.get("href", "") if link_elem is not None else ""

            pub = entry.find("atom:updated", ns) if ns else entry.find("updated")
            if pub is None:
                pub = entry.find("atom:published", ns) if ns else entry.find("published")
            if pub is None:
                pub = entry.find(".//{http://www.w3.org/2005/Atom}updated") or entry.find(".//{http://www.w3.org/2005/Atom}published")
            pub_text = pub.text.strip() if pub is not None and pub.text else ""

            content_elem = entry.find("atom:content", ns) if ns else entry.find("content")
            if content_elem is None:
                content_elem = entry.find("atom:summary", ns) if ns else entry.find("summary")
            if content_elem is None:
                content_elem = entry.find(".//{http://www.w3.org/2005/Atom}content") or entry.find(".//{http://www.w3.org/2005/Atom}summary")
            content_text = content_elem.text.strip() if content_elem is not None and content_elem.text else ""

            entries.append({
                "title": title_text,
                "url": link_href,
                "date": pub_text[:10] if pub_text else "",
                "text": f"{title_text} {content_text}".lower()
            })

        # Handle RSS 2.0 feed (<item>)
        rss_items = root.findall(".//item")
        for item in rss_items:
            title = item.find("title")
            title_text = title.text.strip() if title is not None and title.text else ""

            link = item.find("link")
            link_text = link.text.strip() if link is not None and link.text else ""

            pub = item.find("pubDate")
            pub_text = pub.text.strip() if pub is not None and pub.text else ""

            desc = item.find("description")
            desc_text = desc.text.strip() if desc is not None and desc.text else ""

            entries.append({
                "title": title_text,
                "url": link_text,
                "date": parse_rss_date(pub_text),
                "text": f"{title_text} {desc_text}".lower()
            })
    except Exception as e:
        print(f"⚠️ Error parsing XML: {e}", file=sys.stderr)

    return entries


def parse_rss_date(pub_date_str: str) -> str:
    """Normalizes various RSS date formats to YYYY-MM-DD."""
    if not pub_date_str:
        return ""
    try:
        # e.g., 'Wed, 14 Aug 2026 12:00:00 GMT'
        dt = datetime.datetime.strptime(pub_date_str.split(" GMT")[0].split(" +")[0].strip(), "%a, %d %b %Y %H:%M:%S")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", pub_date_str)
        return match.group(1) if match else pub_date_str[:10]


def calculate_lead_time(first_detected_date: str, official_release_date: str) -> int:
    """Calculates difference in days between discovery canary and official GA release."""
    try:
        d1 = datetime.date.fromisoformat(first_detected_date[:10])
        d2 = datetime.date.fromisoformat(official_release_date[:10])
        diff = (d2 - d1).days
        return max(diff, 0)
    except Exception:
        return 0


def match_change_against_releases(change_meta: dict, release_entries: list) -> dict | None:
    """
    Checks if a canary change matches any official release note item.
    Matches based on extracted RPC methods or distinct keywords.
    """
    methods = change_meta.get("extracted_methods", [])
    slug = change_meta.get("slug", "")
    service = change_meta.get("service_name", "").lower()
    title_keywords = [w.lower() for w in re.findall(r"[A-Za-z0-9_]{4,}", change_meta.get("title", ""))
                      if w.lower() not in {"google", "cloud", "update", "service", "platform", "release"}]

    for rel in release_entries:
        rel_text = rel["text"]

        # 1. Direct RPC method match (strongest signal)
        for method in methods:
            short_method = method.split(".")[-1].lower()
            if short_method in rel_text or method.lower() in rel_text:
                return rel

        # 2. Distinct keyword combination match
        if len(title_keywords) >= 2:
            matched_kw = sum(1 for kw in title_keywords if kw in rel_text)
            if matched_kw >= 2:
                return rel

    return None


def update_markdown_frontmatter(file_path: str, release_info: dict, lead_time_days: int) -> bool:
    """Updates a feed markdown file with released status, lead time, and release URL."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if not content.startswith("---"):
        return False

    parts = content.split("---", 2)
    if len(parts) < 3:
        return False

    fm = parts[1]
    body = parts[2]

    # Remove existing status lines
    fm_lines = [line for line in fm.strip().split("\n")
                if not any(line.startswith(k) for k in ["status:", "lead_time_days:", "official_release_date:", "official_release_notes_url:"])]

    # Add new metadata
    fm_lines.append("status: released")
    fm_lines.append(f"lead_time_days: {lead_time_days}")
    fm_lines.append(f'official_release_date: "{release_info["date"]}"')
    if release_info.get("url"):
        fm_lines.append(f'official_release_notes_url: "{release_info["url"]}"')

    new_content = f"---\n{chr(10).join(fm_lines)}\n---\n{body}"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    return True


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


def run_correlation(feed_dir: str, custom_releases: dict | None = None, project_id: str = "", database_id: str = "", token: str = "") -> list:
    """Runs the correlation engine across all canary changes in feed_dir."""
    files = sorted(glob.glob(os.path.join(feed_dir, "*.md")))
    files = [f for f in files if not f.endswith("README.md")]

    matched_results = []

    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        slug = os.path.basename(file_path).replace(".md", "")
        if "status: released" in content:
            continue  # Already correlated

        # Extract title and methods
        title_match = re.search(r"title:\s*[\"']?(.*?)[\"']?\n", content)
        title = title_match.group(1) if title_match else slug
        first_detected = slug[:10]

        method_matches = list(set(re.findall(r"`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`", content)))

        change_meta = {
            "slug": slug,
            "title": title,
            "first_detected": first_detected,
            "extracted_methods": method_matches,
        }

        # Match against release feeds
        service_key = slug.split("-")[3] if len(slug.split("-")) > 3 else ""
        release_entries = []
        if custom_releases and service_key in custom_releases:
            release_entries = custom_releases[service_key]
        elif service_key in OFFICIAL_RELEASE_FEEDS:
            release_entries = fetch_feed_entries(OFFICIAL_RELEASE_FEEDS[service_key])

        match = match_change_against_releases(change_meta, release_entries)
        if match:
            lead_time = calculate_lead_time(first_detected, match["date"])
            update_markdown_frontmatter(file_path, match, lead_time)
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
    parser.add_argument("--feed-dir", default="feed", help="Path to feed/ directory")
    parser.add_argument("--project", default="gcp-cloud-radar", help="GCP Project ID for Firestore sync")
    parser.add_argument("--database", default="radar", help="Firestore database ID")
    args = parser.parse_args()

    token = ""
    try:
        import subprocess
        token = subprocess.check_output(["gcloud", "auth", "print-access-token", "--quiet"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        pass

    print(f"📡 Starting Canary -> GA Release Correlator on '{args.feed_dir}'...")
    results = run_correlation(args.feed_dir, project_id=args.project, database_id=args.database, token=token)
    print(f"✨ Finished! Correlated {len(results)} new releases.")


if __name__ == "__main__":
    main()
