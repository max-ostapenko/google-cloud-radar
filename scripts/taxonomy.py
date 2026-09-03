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

from typing import TypedDict, Optional


class ServiceMeta(TypedDict, total=False):
    ecosystem: str
    category: str
    quadrant: str
    name: str
    release_feed_url: str


ECOSYSTEMS = [
    "Google Cloud",
    "Workspace",
    "Marketing Platform",
    "Personal",
    "Chrome",
    "Android",
    "More",
]

QUADRANT_MAP = {
    # AI
    "AI & ML": "ai_ml",
    "AI & Machine Learning": "ai_ml",
    # Data Platforms
    "Data Analytics": "data_platforms",
    "Data Platform": "data_platforms",
    "Marketing Platform": "data_platforms",
    "Analytics & Web": "data_platforms",
    "Tag Manager": "data_platforms",
    "Search Console": "data_platforms",
    "PageSpeed Insights": "data_platforms",
    "Chrome UX Report": "data_platforms",
    # Security & FinOps
    "FinOps & Billing": "security_finops",
    "Security": "security_finops",
    "Safe Browsing": "security_finops",
    "Web Risk": "security_finops",
    # Infrastructure & DevOps
    "Application Development": "infra_compute",
    "Compute": "infra_compute",
    "Storage": "infra_compute",
    "Workspace": "infra_compute",
    "Chrome": "infra_compute",
    "Android": "infra_compute",
    "Personal": "infra_compute",
    "More": "infra_compute",
    "DevOps & Discovery": "infra_compute",
    "Core & Other": "infra_compute",
}

WATCHED_SERVICES: dict[str, ServiceMeta] = {
    # =========================================================================
    # 1. GOOGLE CLOUD (includes Firebase)
    # =========================================================================
    # --- AI & ML ---
    "aiplatform": {
        "ecosystem": "Google Cloud",
        "category": "AI & ML",
        "quadrant": "ai_ml",
        "name": "Vertex AI",
        "release_feed_urls": [
            "https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml",
        ],
    },
    "vertex": {
        "ecosystem": "Google Cloud",
        "category": "AI & ML",
        "quadrant": "ai_ml",
        "name": "Vertex AI",
        "release_feed_urls": [
            "https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml",
        ],
    },
    # --- Data Analytics ---
    "bigquery": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigQuery",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "biglake": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigLake",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "bigqueryconnection": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigQuery Connection API",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "bigquerydatapolicy": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigQuery Data Policy",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "bigquerydatatransfer": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigQuery Data Transfer Service",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "bigqueryreservation": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "BigQuery Reservation",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "datacatalog": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Data Catalog",
        "release_feed_url": "https://cloud.google.com/feeds/dataplex-release-notes.xml",
    },
    "dataform": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Dataform",
        "release_feed_url": "https://cloud.google.com/feeds/dataform-release-notes.xml",
    },
    "datalineage": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Data Lineage",
        "release_feed_url": "https://cloud.google.com/feeds/dataplex-release-notes.xml",
    },
    "datapipelines": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Data Pipelines",
        "release_feed_url": "https://cloud.google.com/feeds/dataplex-release-notes.xml",
    },
    "dataplex": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Dataplex",
        "release_feed_url": "https://cloud.google.com/feeds/dataplex-release-notes.xml",
    },
    "analyticshub": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Analytics Hub",
        "release_feed_url": "https://cloud.google.com/feeds/bigquery-release-notes.xml",
    },
    "looker": {
        "ecosystem": "Google Cloud",
        "category": "Data Analytics",
        "quadrant": "data_platforms",
        "name": "Looker Core",
        "release_feed_url": "https://cloud.google.com/feeds/looker-release-notes.xml",
    },
    # --- Application Development & Integration ---
    "connectors": {
        "ecosystem": "Google Cloud",
        "category": "Application Development",
        "quadrant": "infra_compute",
        "name": "Integration Connectors",
        "release_feed_url": "https://docs.cloud.google.com/feeds/integration-connectors-release-notes.xml",
    },
    "integrations": {
        "ecosystem": "Google Cloud",
        "category": "Application Development",
        "quadrant": "infra_compute",
        "name": "Application Integration",
        "release_feed_url": "https://docs.cloud.google.com/feeds/application-integration-release-notes.xml",
    },
    # --- FinOps & Billing ---
    "appoptimize": {
        "ecosystem": "Google Cloud",
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "App Optimize",
    },
    "billingbudgets": {
        "ecosystem": "Google Cloud",
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "Cloud Billing Budgets",
        "release_feed_url": "https://docs.cloud.google.com/feeds/cloud-billing-release-notes.xml",
    },
    "cloudbilling": {
        "ecosystem": "Google Cloud",
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "Cloud Billing",
        "release_feed_url": "https://docs.cloud.google.com/feeds/cloud-billing-release-notes.xml",
    },
    # =========================================================================
    # 2. GOOGLE WORKSPACE
    # =========================================================================
    "script": {
        "ecosystem": "Workspace",
        "category": "Apps Script",
        "quadrant": "infra_compute",
        "name": "Apps Script",
        "release_feed_url": "https://workspaceupdates.googleblog.com/feeds/posts/default",
    },
    "admin": {
        "ecosystem": "Workspace",
        "category": "Admin SDK",
        "quadrant": "infra_compute",
        "name": "Admin SDK",
        "release_feed_url": "https://workspaceupdates.googleblog.com/feeds/posts/default",
    },
    "gmail": {
        "ecosystem": "Workspace",
        "category": "Gmail API",
        "quadrant": "infra_compute",
        "name": "Gmail API",
        "release_feed_url": "https://workspaceupdates.googleblog.com/feeds/posts/default",
    },
    "drive": {
        "ecosystem": "Workspace",
        "category": "Drive API",
        "quadrant": "infra_compute",
        "name": "Drive API",
        "release_feed_url": "https://workspaceupdates.googleblog.com/feeds/posts/default",
    },
    # =========================================================================
    # 3. GOOGLE MARKETING PLATFORM
    # =========================================================================
    "tagmanager": {
        "ecosystem": "Marketing Platform",
        "category": "Tag Manager",
        "quadrant": "data_platforms",
        "name": "Tag Manager",
    },
    "searchconsole": {
        "ecosystem": "Marketing Platform",
        "category": "Search Console",
        "quadrant": "data_platforms",
        "name": "Search Console",
    },
    "pagespeedonline": {
        "ecosystem": "Marketing Platform",
        "category": "PageSpeed Insights",
        "quadrant": "data_platforms",
        "name": "PageSpeed Insights",
    },
    "chromeuxreport": {
        "ecosystem": "Marketing Platform",
        "category": "Chrome UX Report",
        "quadrant": "data_platforms",
        "name": "Chrome UX Report",
    },
    # =========================================================================
    # 4. PERSONAL / CONSUMER
    # =========================================================================
    "photoslibrary": {
        "ecosystem": "Personal",
        "category": "Photos Library",
        "quadrant": "infra_compute",
        "name": "Photos Library API",
    },
    "youtube": {
        "ecosystem": "Personal",
        "category": "YouTube Data API",
        "quadrant": "infra_compute",
        "name": "YouTube Data API",
    },
    # =========================================================================
    # 5. CHROME & WEB
    # =========================================================================
    "abusiveexperiencereport": {
        "ecosystem": "Chrome",
        "category": "Abusive Experience",
        "quadrant": "infra_compute",
        "name": "Abusive Experience Report",
    },
    "adexperiencereport": {
        "ecosystem": "Chrome",
        "category": "Ad Experience",
        "quadrant": "infra_compute",
        "name": "Ad Experience Report",
    },
    "versionhistory": {
        "ecosystem": "Chrome",
        "category": "Version History",
        "quadrant": "infra_compute",
        "name": "Version History",
    },
    # =========================================================================
    # 6. ANDROID & PLAY
    # =========================================================================
    "androidpublisher": {
        "ecosystem": "Android",
        "category": "Google Play",
        "quadrant": "infra_compute",
        "name": "Google Play Developer API",
        "release_feed_url": "https://android-developers.googleblog.com/feeds/posts/default",
    },
    # =========================================================================
    # 7. MORE / CORE & SECURITY
    # =========================================================================
    "discovery": {
        "ecosystem": "More",
        "category": "Discovery Engine",
        "quadrant": "infra_compute",
        "name": "Discovery Engine",
    },
    "safebrowsing": {
        "ecosystem": "More",
        "category": "Safe Browsing",
        "quadrant": "security_finops",
        "name": "Safe Browsing",
    },
    "webrisk": {
        "ecosystem": "More",
        "category": "Web Risk",
        "quadrant": "security_finops",
        "name": "Web Risk",
    },
    "libraryagent": {
        "ecosystem": "More",
        "category": "Sample APIs",
        "quadrant": "infra_compute",
        "name": "Library Agent",
    },
}


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
        if key in lower:
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
        if key in lower:
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
