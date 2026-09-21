#!/usr/bin/env python3
"""
Taxonomy and Watchlist Configuration for Google Cloud Radar.

Hierarchical 3-level taxonomy:
1. Ecosystems: List of ecosystems with categories ID list
2. Categories: List of categories with services ID list
3. Services: Dictionary of services with canonical names, aliases, and release feeds

Re-/moving service happens by updating the parent category's services list.
Changing category/ecosystem metadata happens within their respective objects.
"""

import json
import re
from pathlib import Path
from typing import TypedDict, Optional


class ServiceMeta(TypedDict, total=False):
    ecosystem: str
    ecosystem_id: str
    category: str
    category_id: str
    name: str
    aliases: list[str]
    release_feed_url: str
    release_feed_urls: list[str]


TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "data" / "taxonomy.json"

with open(TAXONOMY_PATH, "r", encoding="utf-8") as _f:
    _TAXONOMY_DATA = json.load(_f)

_ECOSYSTEMS_RAW: list[dict] = _TAXONOMY_DATA.get("ecosystems", [])
_CATEGORIES_RAW: list[dict] = _TAXONOMY_DATA.get("categories", [])
_SERVICES_RAW: dict[str, dict] = _TAXONOMY_DATA.get("services", {})

ECOSYSTEMS_BY_ID: dict[str, dict] = {e["id"]: e for e in _ECOSYSTEMS_RAW}
CATEGORIES_BY_ID: dict[str, dict] = {c["id"]: c for c in _CATEGORIES_RAW}

# Parent mappings
CATEGORY_TO_ECOSYSTEM: dict[str, dict] = {}
for eco in _ECOSYSTEMS_RAW:
    for cat_id in eco.get("categories", []):
        CATEGORY_TO_ECOSYSTEM[cat_id] = eco

SERVICE_TO_CATEGORY: dict[str, dict] = {}
for cat in _CATEGORIES_RAW:
    for svc_id in cat.get("services", []):
        SERVICE_TO_CATEGORY[svc_id] = cat

SERVICE_TO_ECOSYSTEM: dict[str, dict] = {}
for eco in _ECOSYSTEMS_RAW:
    for svc_id in eco.get("services", []):
        SERVICE_TO_ECOSYSTEM[svc_id] = eco

# Resolved ServiceMeta for all services
WATCHED_SERVICES: dict[str, ServiceMeta] = {}
for svc_id, svc_data in _SERVICES_RAW.items():
    cat = SERVICE_TO_CATEGORY.get(svc_id)
    if cat:
        eco = CATEGORY_TO_ECOSYSTEM.get(cat.get("id"), {})
        category_name = cat.get("name", "")
        category_id = cat.get("id", "")
    else:
        eco = SERVICE_TO_ECOSYSTEM.get(svc_id, {})
        category_name = ""
        category_id = ""

    meta: ServiceMeta = {
        "name": svc_data.get("name", svc_id),
        "ecosystem": eco.get("name", "More"),
        "ecosystem_id": eco.get("id", "more"),
        "aliases": svc_data.get("aliases", []),
        "release_feed_url": svc_data.get("release_feed_url"),
        "release_feed_urls": svc_data.get("release_feed_urls", []),
    }
    if category_name:
        meta["category"] = category_name
        meta["category_id"] = category_id

    WATCHED_SERVICES[svc_id] = meta

# Backward compatibility lists
ECOSYSTEMS: list[str] = [e["name"] for e in _ECOSYSTEMS_RAW]
CATEGORIES: list[str] = [c["name"] for c in _CATEGORIES_RAW]


def get_ecosystems() -> list[dict]:
    """Returns the list of all ecosystem definitions with categories ID list."""
    return _ECOSYSTEMS_RAW


def get_categories() -> list[dict]:
    """Returns the list of all category definitions with services ID list."""
    return _CATEGORIES_RAW


def get_services() -> dict[str, dict]:
    """Returns the raw service definitions map."""
    return _SERVICES_RAW


def _find_service_meta(service_or_api: str) -> Optional[ServiceMeta]:
    """Finds matching ServiceMeta using exact key, API prefix, aliases, or name."""
    if not service_or_api:
        return None
    lower = service_or_api.lower().strip()
    if lower in WATCHED_SERVICES:
        return WATCHED_SERVICES[lower]

    # Check API prefix (e.g. "aiplatform.v1" -> "aiplatform", "discoveryengine:v1" -> "discoveryengine")
    prefix = lower.split(".")[0].split(":")[0]
    if prefix in WATCHED_SERVICES:
        return WATCHED_SERVICES[prefix]

    clean = re.sub(r"[^a-z0-9]", "", lower)
    if clean in WATCHED_SERVICES:
        return WATCHED_SERVICES[clean]

    clean_prefix = re.sub(r"[^a-z0-9]", "", prefix)
    if clean_prefix in WATCHED_SERVICES:
        return WATCHED_SERVICES[clean_prefix]

    # Exact or alias/name matches
    for key, meta in WATCHED_SERVICES.items():
        name = meta.get("name", "").lower()
        aliases = [a.lower() for a in meta.get("aliases", []) if isinstance(a, str)]
        for candidate in [name] + aliases:
            if not candidate:
                continue
            if candidate == lower:
                return meta
            clean_cand = re.sub(r"[^a-z0-9]", "", candidate)
            if clean and clean == clean_cand:
                return meta

    # Check if a full canonical name or alias is contained in the query string
    for key, meta in WATCHED_SERVICES.items():
        name = meta.get("name", "").lower()
        aliases = [a.lower() for a in meta.get("aliases", []) if isinstance(a, str)]
        for candidate in [name] + aliases:
            if candidate and len(candidate) >= 4 and candidate in lower:
                return meta

    return None


def is_watched_api(api_name: str) -> bool:
    """Returns True if the API is on the watchlist."""
    return _find_service_meta(api_name) is not None


def get_watched_api_names() -> list[str]:
    """Returns a sorted list of all watched API names."""
    return sorted(WATCHED_SERVICES.keys())


def get_ecosystem_for_service(service_or_api: str) -> str:
    """Returns top-level ecosystem name (e.g. AI/ML, Databases and analytics, etc.)."""
    meta = _find_service_meta(service_or_api)
    if meta:
        return meta.get("ecosystem", "More")
    return "More"


def get_category_for_service(service_or_api: str) -> Optional[str]:
    """Classifies a service or API name into a standardized category if one exists."""
    meta = _find_service_meta(service_or_api)
    if meta:
        return meta.get("category")
    return None



def get_release_feed_urls(service_or_api: str) -> list[str]:
    """Returns list of official Google release RSS/Atom feed URLs for a service if configured."""
    meta = _find_service_meta(service_or_api)
    if not meta:
        return []

    urls = []
    if "release_feed_urls" in meta and isinstance(meta["release_feed_urls"], list):
        for u in meta["release_feed_urls"]:
            if u and u not in urls:
                urls.append(u)
    if "release_feed_url" in meta and meta["release_feed_url"]:
        if meta["release_feed_url"] not in urls:
            urls.append(meta["release_feed_url"])
    return urls


def get_release_feed_url(service_or_api: str) -> Optional[str]:
    """Returns the primary official Google release RSS/Atom feed URL for backward compatibility."""
    urls = get_release_feed_urls(service_or_api)
    return urls[0] if urls else None


def get_official_release_feeds() -> dict[str, str]:
    """Returns a mapping of service identifier to official release notes RSS feed URL."""
    feeds = {}
    for key in WATCHED_SERVICES:
        urls = get_release_feed_urls(key)
        if urls:
            feeds[key] = urls[0]
    return feeds
