#!/usr/bin/env python3
"""
Taxonomy and Watchlist Configuration for Google Cloud Radar.

Defines a two-level hierarchy:
1. Top-Level Ecosystem:
   - Google Cloud (includes Firebase)
   - Google Workspace
   - Google Marketing Platform
   - Personal
   - Chrome
   - Android
   - More (Discovery, Core, Security)

2. Subcategory:
   - For Google Cloud: AI & ML, Data Analytics, Application Development, FinOps & Billing, Security, Observability.
   - For other ecosystems: Product-specific category.

3. Thoughtworks Tech Radar Quadrant Mapping:
   - ai_ml, data_platforms, infra_compute, security_finops
"""

import json
from pathlib import Path
from typing import TypedDict, Optional


class ServiceMeta(TypedDict, total=False):
    ecosystem: str
    category: str
    quadrant: str
    name: str
    release_feed_url: str
    release_feed_urls: list[str]


TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "data" / "taxonomy.json"

with open(TAXONOMY_PATH, "r", encoding="utf-8") as _f:
    _TAXONOMY_DATA = json.load(_f)

ECOSYSTEMS: list[str] = _TAXONOMY_DATA.get("ecosystems", [])
QUADRANT_MAP: dict[str, str] = _TAXONOMY_DATA.get("quadrant_map", {})
WATCHED_SERVICES: dict[str, ServiceMeta] = _TAXONOMY_DATA.get("watched_services", {})


def is_watched_api(api_name: str) -> bool:
    """Returns True if the API is on the watchlist."""
    return api_name.lower() in WATCHED_SERVICES


def get_watched_api_names() -> list[str]:
    """Returns a sorted list of all watched API names."""
    return sorted(WATCHED_SERVICES.keys())


def get_ecosystem_for_service(service_or_api: str) -> str:
    """Returns top-level ecosystem (e.g. Google Cloud, Workspace, Marketing Platform, etc.)."""
    lower = service_or_api.lower()
    if lower in WATCHED_SERVICES:
        return WATCHED_SERVICES[lower].get("ecosystem", "Google Cloud")
    for key, meta in WATCHED_SERVICES.items():
        if key in lower or meta.get("name", "").lower() in lower:
            return meta.get("ecosystem", "Google Cloud")
    return "More"


def get_category_for_service(service_or_api: str) -> str:
    """
    Classifies a service or API name into a standardized category.
    Performs exact match first, then substring matching.
    """
    lower = service_or_api.lower()
    if lower in WATCHED_SERVICES:
        return WATCHED_SERVICES[lower].get("category", "Data Analytics")

    for key, meta in WATCHED_SERVICES.items():
        if key in lower or meta.get("name", "").lower() in lower:
            return meta.get("category", "Data Analytics")

    return "Data Analytics"


def get_quadrant_for_service(service_or_api: str) -> str:
    """Returns the Thoughtworks Tech Radar quadrant for a given service."""
    lower = service_or_api.lower()
    if lower in WATCHED_SERVICES:
        return WATCHED_SERVICES[lower].get("quadrant", "data_platforms")

    category = get_category_for_service(service_or_api)
    return QUADRANT_MAP.get(category, "data_platforms")


def determine_radar_ring(status: str, is_breaking: bool, version: str) -> str:
    """
    Maps API change attributes to Thoughtworks Tech Radar rings:
    - hold: deprecated / heavy breaking risk
    - adopt: stable GA / released
    - trial: public beta / preview / v1beta1
    - assess: early canary pre-release signal
    """
    status_lower = status.lower()
    version_lower = version.lower()

    if "deprecat" in status_lower or is_breaking:
        return "hold"
    if status_lower in ("released", "ga") or (
        "v1" in version_lower
        and "beta" not in version_lower
        and "alpha" not in version_lower
    ):
        return "adopt"
    if "beta" in version_lower or "preview" in status_lower or "trial" in status_lower:
        return "trial"
    return "assess"


def get_release_feed_urls(service_or_api: str) -> list[str]:
    """Returns list of official Google release RSS/Atom feed URLs for a service if configured."""
    lower = service_or_api.lower()
    meta = None
    if lower in WATCHED_SERVICES:
        meta = WATCHED_SERVICES[lower]
    else:
        for key, candidate_meta in WATCHED_SERVICES.items():
            if key in lower:
                meta = candidate_meta
                break
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
