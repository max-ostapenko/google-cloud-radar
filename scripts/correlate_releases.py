#!/usr/bin/env python3
"""
Automated Canary -> GA Release Correlator for Google Cloud Radar.

Scans official Google Cloud release note RSS/Atom feeds, detects when an
unpublished Canary method or feature is officially documented, calculates
the lead time (in days), and updates the JSON records and Firestore documents.
"""

import argparse
import datetime
import email.utils
import glob
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Optional

try:
    from scripts.taxonomy import (
        get_release_feed_url,
        get_release_feed_urls,
        get_official_release_feeds,
    )
except ImportError:
    from taxonomy import (  # type: ignore[import-not-found, no-redef]
        get_release_feed_url,
        get_release_feed_urls,
        get_official_release_feeds,
    )

OFFICIAL_RELEASE_FEEDS = get_official_release_feeds()

_FEED_CACHE: dict[str, list] = {}
_FEED_HEALTH: dict[str, dict] = {}

SERVICE_AFFINITY_KEYWORDS = {
    "gmail": ["gmail", "mail", "email", "inbox", "message"],
    "drive": ["drive", "google drive", "doc", "docs", "sheet", "sheets", "slide", "slides", "file", "folder"],
    "admin": ["admin", "directory", "organization", "domain", "workspace", "user", "transfer"],
    "script": ["apps script", "script", "appsscript", "macro", "execution"],
    "androidpublisher": ["play", "google play", "play store", "android", "developer console", "billing", "monetization"],
}


def load_release_archive(archive_path: str) -> dict[str, list[dict]]:
    """Loads historical release notes archive from JSON disk file."""
    if os.path.exists(archive_path):
        try:
            with open(archive_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(f"⚠️ Warning loading release archive: {e}", file=sys.stderr)
    return {}


ARCHIVE_RETENTION_DAYS = 180


def save_release_archive(archive_path: str, archive_data: dict[str, list[dict]]) -> None:
    """Saves release notes archive to disk with a rolling retention window and lean bullets
    to prevent repository and cache bloat.
    """
    try:
        cutoff_date = (datetime.date.today() - datetime.timedelta(days=ARCHIVE_RETENTION_DAYS)).isoformat()
        lean_archive: dict[str, list[dict]] = {}

        for feed_url, entries in archive_data.items():
            feed_entries = []
            for e in entries:
                d = e.get("date", "")
                if d and d < cutoff_date:
                    continue
                bullets = e.get("bullets")
                if bullets is None:
                    raw_content = e.get("content", "")
                    bullets = extract_bullets(raw_content, e.get("title", ""))
                feed_entries.append(
                    {
                        "title": e.get("title", ""),
                        "url": e.get("url", ""),
                        "date": d,
                        "bullets": bullets,
                    }
                )
            if feed_entries:
                lean_archive[feed_url] = feed_entries

        dir_name = os.path.dirname(os.path.abspath(archive_path))
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(archive_path, "w", encoding="utf-8") as f:
            json.dump(lean_archive, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as e:
        print(f"⚠️ Warning saving release archive: {e}", file=sys.stderr)


def log_feed_warning(service_key: str, feed_url: str, message: str) -> None:
    """Logs a formatted warning to stderr and emits a GitHub Actions warning annotation if in CI."""
    warn_text = f"⚠️ [FEED_HEALTH] {service_key or 'Feed'}: {message} ({feed_url})"
    print(warn_text, file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        # GitHub Actions workflow command to create an in-UI warning banner
        title = f"Release Feed Warning ({service_key})" if service_key else "Release Feed Warning"
        print(f"::warning title={title}::{message} at {feed_url}")


def fetch_feed_entries(
    feed_url: str, service_key: str = "", archive: Optional[dict] = None
) -> list:
    """Fetches and parses an RSS/Atom release notes feed, caching results per run.
    Merges live entries with persistent archive so historical notes beyond Google's 30-item limit are preserved.
    Monitors feed health (HTTP errors, empty content) and alerts accordingly.
    """
    if feed_url in _FEED_CACHE:
        # Register additional service sharing this cached feed
        if service_key and feed_url in _FEED_HEALTH:
            services = _FEED_HEALTH[feed_url].setdefault("services", [])
            if service_key not in services:
                services.append(service_key)
        return _FEED_CACHE[feed_url]

    req = urllib.request.Request(
        feed_url,
        headers={
            "User-Agent": "GCP-Discovery-Radar/1.0 (+https://google-cloud-radar.com)"
        },
    )
    live_entries = []
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            status_code = resp.getcode()
            if status_code != 200:
                log_feed_warning(service_key, feed_url, f"Unexpected HTTP status {status_code}")
                _FEED_HEALTH[feed_url] = {"status": "error", "error": f"HTTP {status_code}", "services": [service_key]}
            else:
                xml_text = resp.read().decode("utf-8")
                live_entries = parse_feed_xml(xml_text)
                if not live_entries:
                    log_feed_warning(service_key, feed_url, "Feed returned 200 OK but contained 0 parseable entries")
                    _FEED_HEALTH[feed_url] = {"status": "empty", "services": [service_key]}
                else:
                    _FEED_HEALTH[feed_url] = {"status": "healthy", "count": len(live_entries), "services": [service_key]}
    except Exception as e:
        err_msg = str(e)
        log_feed_warning(service_key, feed_url, f"Network/HTTP error: {err_msg}")
        _FEED_HEALTH[feed_url] = {"status": "error", "error": err_msg, "services": [service_key]}

    # Merge with persistent archive
    combined_entries = []
    seen_ids = set()

    # Add live entries first
    for e in live_entries:
        uid = e.get("url") or f"{e.get('date')}:{e.get('title')}"
        if uid not in seen_ids:
            seen_ids.add(uid)
            combined_entries.append(e)

    # Add historical entries from archive
    if archive is not None and feed_url in archive:
        for e in archive[feed_url]:
            uid = e.get("url") or f"{e.get('date')}:{e.get('title')}"
            if uid not in seen_ids:
                seen_ids.add(uid)
                combined_entries.append(e)

    if archive is not None and combined_entries:
        archive[feed_url] = combined_entries

    _FEED_CACHE[feed_url] = combined_entries
    return combined_entries


def parse_feed_xml(xml_text: str) -> list:
    """Parses XML string into a list of release entries (title, link, published_date, content).
    Supports both Atom (<entry>) and RSS 2.0 (<item>) standards.
    """
    entries = []
    try:
        root = ET.fromstring(xml_text)
        m = re.match(r"\{([^}]+)\}", root.tag)
        ns_uri = m.group(1) if m else ""
        ns = {"atom": ns_uri} if ns_uri else {}

        # 1. Look for Atom entries
        raw_entries = root.findall("atom:entry", ns) if ns else root.findall("entry")
        if not raw_entries:
            raw_entries = root.findall(".//{http://www.w3.org/2005/Atom}entry") or root.findall(".//entry")

        # 2. If no Atom entries, check for RSS 2.0 <item> elements
        if not raw_entries:
            raw_entries = root.findall(".//item")

        for entry in raw_entries:
            # Title
            title = entry.find("atom:title", ns) if ns else entry.find("title")
            if title is None:
                title = entry.find(".//{http://www.w3.org/2005/Atom}title") or entry.find(".//title")
            title_text = title.text.strip() if title is not None and title.text else ""

            # Link (prefer rel="alternate" or type="text/html")
            link_url = ""
            links = entry.findall("atom:link", ns) if ns else entry.findall("link")
            for l in links:
                rel = l.attrib.get("rel", "alternate")
                href = l.attrib.get("href", "")
                if rel == "alternate" and href:
                    link_url = href
                    break
            if not link_url and links:
                link_url = links[0].attrib.get("href") or links[0].text or ""
            if not link_url:
                link_elem = entry.find("link")
                if link_elem is not None:
                    link_url = link_elem.text or link_elem.attrib.get("href", "")

            # Normalize Google doc URLs: Google's feed generator erroneously inserts /docs/ for gemini-enterprise-agent-platform
            if "gemini-enterprise-agent-platform/docs/release-notes" in link_url:
                link_url = link_url.replace(
                    "gemini-enterprise-agent-platform/docs/release-notes",
                    "gemini-enterprise-agent-platform/release-notes",
                )

            # Date (Atom updated/published or RSS pubDate/dc:date)
            pub_elem = None
            for tag in ["atom:updated", "atom:published", "updated", "published", "pubDate", "dc:date"]:
                candidate = entry.find(tag, ns) if (ns and tag.startswith("atom:")) else entry.find(tag)
                if candidate is not None and candidate.text:
                    pub_elem = candidate
                    break
            raw_date = pub_elem.text.strip() if pub_elem is not None and pub_elem.text else ""
            parsed_d = parse_date(raw_date)
            date_str = parsed_d.isoformat() if parsed_d else raw_date[:10]

            # Content
            content_elem = None
            for tag in ["atom:content", "atom:summary", "content", "summary", "description", "{http://purl.org/rss/1.0/modules/content/}encoded"]:
                candidate = entry.find(tag, ns) if (ns and tag.startswith("atom:")) else entry.find(tag)
                if candidate is not None and candidate.text:
                    content_elem = candidate
                    break
            content_text = content_elem.text.strip() if content_elem is not None and content_elem.text else ""

            if title_text or content_text:
                entries.append(
                    {
                        "title": title_text,
                        "url": link_url,
                        "date": date_str,
                        "content": content_text,
                    }
                )
    except Exception as e:
        print(f"⚠️ XML parse error: {e}", file=sys.stderr)

    return entries


def parse_date(date_str: str) -> datetime.date | None:
    """Parses ISO-8601, RFC-822/2822, or natural date string into a datetime.date object."""
    if not date_str:
        return None
    cleaned = date_str.strip()
    # Try ISO date prefix YYYY-MM-DD
    if len(cleaned) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", cleaned):
        try:
            return datetime.datetime.strptime(cleaned[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    # Try RFC-822 / RFC-2822 (standard RSS pubDate, e.g. 'Tue, 25 Aug 2026 09:00:00 GMT')
    try:
        dt = email.utils.parsedate_to_datetime(cleaned)
        return dt.date()
    except Exception:
        pass
    # Try human/Atom header formats (e.g. 'March 16, 2026')
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y/%m/%d"):
        try:
            return datetime.datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass
    return None


def calculate_lead_time(canary_date_str: str, release_date_str: str) -> int:
    """Calculates lead time delta in days between discovery canary and official GA.
    Returns max(0, delta) or 0 on parse failure.
    """
    d1 = parse_date(canary_date_str)
    d2 = parse_date(release_date_str)
    if not d1 or not d2:
        return 0
    delta = (d2 - d1).days
    return max(0, delta)


GENERIC_DOMAIN_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "for", "with", "to", "of", "at", "by", "from",
    "api", "update", "updates", "new", "support", "supports", "supported",
    "breaking", "change", "changes", "changed", "feature", "features",
    "service", "services", "version", "beta", "alpha", "v1", "v2", "v3",
    "google", "cloud", "platform", "field", "fields", "resource", "resources",
    "method", "methods", "schema", "introduces", "adds", "added", "removes", "removed",
    "deprecated", "deprecation", "deprecations", "clarified", "clarifies", "clarification",
    "agent", "agents", "safety", "client", "runtime", "runtimes", "system", "systems",
    "model", "models", "workflow", "workflows", "controls", "management",
    "developer", "developers", "preview", "general", "availability", "ga",
    "configuration", "config", "endpoint", "endpoints", "request", "requests", "response", "responses",
    "data", "policy", "policies", "iam", "reports", "admin", "workspace", "organization", "project",
    "user", "users", "group", "groups", "call", "calls", "parameters", "parameter", "properties", "property",
    "query", "queries", "result", "results", "table", "tables", "file", "files", "item", "items", "code"
}

GENERIC_METHOD_VERBS = {
    "get", "set", "list", "create", "delete", "update", "patch", "search",
    "export", "import", "batch", "cancel", "run", "read", "write", "call"
}


def extract_bullets(content_html: str, title: str = "") -> list[str]:
    """Extracts individual release note bullets/paragraphs to prevent cross-bullet false matches."""
    chunks = re.split(r"</?(?:li|p|h[2-4]|tr|section|article)\b[^>]*>", content_html, flags=re.IGNORECASE)
    cleaned = []
    if title and len(title) > 10:
        cleaned.append(title.lower())
    for c in chunks:
        text = re.sub(r"<[^>]+>", " ", c).strip()
        text = re.sub(r"\s+", " ", text)
        if len(text) >= 20:
            cleaned.append(text.lower())
    return cleaned


def extract_technical_phrases(title: str) -> list[str]:
    """Extracts distinctive 2-word and 3-word technical phrases from title."""
    words = re.findall(r"[A-Za-z0-9_]+", title.lower())
    phrases = []
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i+1]
        if w1 not in GENERIC_DOMAIN_WORDS and w2 not in GENERIC_DOMAIN_WORDS and len(w1) >= 4 and len(w2) >= 4:
            phrases.append(f"{w1} {w2}")
    for i in range(len(words) - 2):
        w1, w2, w3 = words[i], words[i+1], words[i+2]
        if (w1 not in GENERIC_DOMAIN_WORDS or w2 not in GENERIC_DOMAIN_WORDS) and w3 not in GENERIC_DOMAIN_WORDS:
            p = f"{w1} {w2} {w3}"
            if len(p) >= 12:
                phrases.append(p)
    return phrases


def match_change_against_releases(
    change_meta: dict, release_entries: list, max_lead_days: int = 120, service_key: str = ""
) -> dict | None:
    """Matches a canary change entry against official release entries with strict confidence.
    Prioritizes high confidence:
    1. Specific technical RPC method or qualified resource name in the release bullet.
    2. Exact multi-word technical keyphrase match inside a single release bullet.
    3. Distinctive keyword cluster (>= 3 rare domain words) strictly within the SAME bullet.
    """
    if not release_entries:
        return None

    canary_date = parse_date(change_meta.get("first_detected") or "")
    if not canary_date:
        return None

    title = change_meta.get("title", "").lower()
    technical_phrases = extract_technical_phrases(change_meta.get("title", ""))
    rare_words = [w for w in re.findall(r"[a-z0-9_]+", title) if len(w) >= 5 and w not in GENERIC_DOMAIN_WORDS]
    methods = [m.lower() for m in change_meta.get("extracted_methods", [])]

    # Pre-qualify RPC methods
    qual_methods = []
    for m in methods:
        parts = m.split(".")
        short_m = parts[-1]
        if short_m in GENERIC_METHOD_VERBS and len(parts) >= 2:
            qual_methods.append(f"{parts[-2]}.{short_m}")
        elif len(short_m) >= 6 and short_m not in GENERIC_METHOD_VERBS:
            qual_methods.append(short_m)

    valid_candidates = []

    for rel in release_entries:
        rel_date = parse_date(rel.get("date") or "")
        if not rel_date:
            continue

        delta_days = (rel_date - canary_date).days
        if delta_days < -1 or delta_days > max_lead_days:
            continue

        bullets = rel.get("bullets")
        if bullets is None:
            bullets = extract_bullets(rel.get("content", ""), rel.get("title", ""))
        matched = False

        for b in bullets:
            # 1. Distinctive RPC Method Match in this bullet
            for qm in qual_methods:
                if re.search(r"\b" + re.escape(qm) + r"\b", b):
                    matched = True
                    break
            if matched:
                break

            # 2. Multi-word technical phrase in this bullet
            for tp in technical_phrases:
                if tp in b:
                    matched = True
                    break
            if matched:
                break

            # 3. >= 3 rare domain words in this single bullet
            b_words = [w for w in rare_words if re.search(r"\b" + re.escape(w) + r"\b", b)]
            if len(b_words) >= 3:
                matched = True
                break

        if matched:
            valid_candidates.append((delta_days, rel))

    if not valid_candidates:
        return None

    # Pick the match with the closest subsequent release date
    valid_candidates.sort(key=lambda x: (abs(x[0]), x[0]))
    return valid_candidates[0][1]


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


def update_firestore_release(
    project_id: str,
    database_id: str,
    slug: str,
    release_info: dict,
    lead_time_days: int,
    token: str,
) -> bool:
    """Updates release correlation fields directly on the Firestore document."""
    if not token or not project_id or not database_id:
        return False

    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{database_id}/documents/changes/{slug}?updateMask.fieldPaths=status&updateMask.fieldPaths=radar_ring&updateMask.fieldPaths=lead_time_days&updateMask.fieldPaths=official_release_date&updateMask.fieldPaths=official_release_notes_url&updateMask.fieldPaths=last_updated_at"

    rel_date = f"{release_info['date'][:10]}T00:00:00.000Z"
    now_iso = (
        datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    )

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
            "Content-Type": "application/json",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"⚠️ Error updating Firestore for {slug}: {e}", file=sys.stderr)
        return False


def run_correlation(
    data_dir: str,
    custom_releases: dict | None = None,
    project_id: str = "",
    database_id: str = "",
    token: str = "",
    archive_path: Optional[str] = None,
) -> list:
    """Runs the correlation engine across all canary changes in data_dir."""
    files = sorted(glob.glob(os.path.join(data_dir, "*.json")))

    if archive_path is None:
        archive_path = os.path.join(os.path.dirname(data_dir), "release_notes_archive.json")

    archive = load_release_archive(archive_path) if archive_path else {}
    matched_results = []

    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        slug = (
            data.get("slug")
            or data.get("id")
            or os.path.basename(file_path).replace(".json", "")
        )
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

        # Match against release feeds (supports multi-feed mapping)
        service_key = slug.split("-")[3] if len(slug.split("-")) > 3 else ""
        feed_urls = get_release_feed_urls(service_key)
        if not feed_urls and service_key in OFFICIAL_RELEASE_FEEDS:
            feed_urls = [OFFICIAL_RELEASE_FEEDS[service_key]]

        release_entries = []
        if custom_releases and service_key in custom_releases:
            release_entries = custom_releases[service_key]
        elif feed_urls:
            seen_uids = set()
            for u in feed_urls:
                for entry in fetch_feed_entries(u, service_key=service_key, archive=archive):
                    uid = entry.get("url") or f"{entry.get('date')}:{entry.get('title')}"
                    if uid not in seen_uids:
                        seen_uids.add(uid)
                        release_entries.append(entry)

        match = match_change_against_releases(
            change_meta, release_entries, service_key=service_key
        )
        if match:
            lead_time = calculate_lead_time(first_detected, match["date"])
            update_json_file(file_path, match, lead_time)
            if project_id and database_id and token:
                update_firestore_release(
                    project_id, database_id, slug, match, lead_time, token
                )

            matched_results.append(
                {
                    "slug": slug,
                    "lead_time_days": lead_time,
                    "official_release_date": match["date"],
                    "official_url": match.get("url", ""),
                }
            )
            print(
                f"🎯 Correlated! {slug} -> Officially released on {match['date']} (Lead time: {lead_time} days)"
            )

    if matched_results:
        # Sync index.json if it exists
        index_path = os.path.join(os.path.dirname(data_dir), "index.json")
        if os.path.exists(index_path):
            try:
                with open(index_path, "r", encoding="utf-8") as f:
                    index_data = json.load(f)
                matched_dict = {m["slug"]: m for m in matched_results}
                for entry in index_data:
                    slug = entry.get("slug")
                    if slug in matched_dict:
                        m = matched_dict[slug]
                        entry["status"] = "released"
                        entry["radar_ring"] = "adopt"
                        entry["lead_time_days"] = m["lead_time_days"]
                        entry["official_release_date"] = m["official_release_date"]
                        entry["official_release_notes_url"] = m["official_url"]
                with open(index_path, "w", encoding="utf-8") as f:
                    json.dump(index_data, f, indent=2, ensure_ascii=False)
                    f.write("\n")
            except Exception as e:
                print(f"⚠️ Error syncing index.json: {e}", file=sys.stderr)

    # Persist release notes archive
    if archive and archive_path:
        save_release_archive(archive_path, archive)

    # Summary of feed health
    total_feeds = len(_FEED_HEALTH)
    healthy_feeds = sum(1 for h in _FEED_HEALTH.values() if h.get("status") == "healthy")
    warning_feeds = total_feeds - healthy_feeds
    if total_feeds > 0:
        print(f"\n📊 Release Feed Health: {healthy_feeds}/{total_feeds} feeds active and healthy ({warning_feeds} warnings)")
        for url, h in _FEED_HEALTH.items():
            if h.get("status") != "healthy":
                svcs = ", ".join(h.get("services", []))
                print(f"   ⚠️ Warning [{svcs}]: {h.get('error', '0 entries parsed')} ({url})")

    # Optionally write to GitHub Actions Step Summary if available
    step_summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary_path and os.path.exists(os.path.dirname(step_summary_path)):
        try:
            with open(step_summary_path, "a", encoding="utf-8") as f:
                f.write("\n### 📡 Release Feed Health Summary\n\n")
                f.write(f"**{healthy_feeds}/{total_feeds}** feeds verified active.\n\n")
                if warning_feeds > 0:
                    f.write("| Service | Status | Feed URL |\n|---|---|---|\n")
                    for url, h in _FEED_HEALTH.items():
                        if h.get("status") != "healthy":
                            svcs = ", ".join(h.get("services", []))
                            f.write(f"| `{svcs}` | ⚠️ {h.get('error', 'Empty')} | `{url}` |\n")
        except Exception:
            pass

    return matched_results


def main():
    parser = argparse.ArgumentParser(
        description="Correlate Canary changes with official Google Cloud release notes."
    )
    parser.add_argument(
        "--data-dir", default="data/changes", help="Path to data/changes directory"
    )
    parser.add_argument(
        "--archive-path",
        default="data/release_notes_archive.json",
        help="Path to persistent release notes archive JSON",
    )
    parser.add_argument(
        "--project", default="gcp-cloud-radar", help="GCP Project ID for Firestore sync"
    )
    parser.add_argument("--database", default="radar", help="Firestore database ID")
    args = parser.parse_args()

    token = ""
    try:
        import subprocess

        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token", "--quiet"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        pass

    print(f"📡 Starting Canary -> GA Release Correlator on '{args.data_dir}'...")
    results = run_correlation(
        args.data_dir,
        project_id=args.project,
        database_id=args.database,
        token=token,
        archive_path=args.archive_path,
    )
    print(f"✨ Finished! Correlated {len(results)} new releases.")


if __name__ == "__main__":
    main()
