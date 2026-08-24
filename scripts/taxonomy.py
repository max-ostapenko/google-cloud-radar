#!/usr/bin/env python3
"""
Taxonomy and Watchlist Configuration for Google Cloud Radar.

Single source of truth for:
- Monitored Google APIs (discovery watchlist)
- Standardized service categories
- Thoughtworks Tech Radar quadrants and ring evaluation logic
"""

from typing import TypedDict, Optional


class ServiceMeta(TypedDict, total=False):
    category: str
    quadrant: str
    name: str


QUADRANT_MAP = {
    "AI & Machine Learning": "ai_ml",
    "Data Platform": "data_platforms",
    "DevOps & Discovery": "infra_compute",
    "FinOps & Billing": "security_finops",
    "Analytics & Web": "data_platforms",
    "Core & Other": "infra_compute",
}

WATCHED_SERVICES: dict[str, ServiceMeta] = {
    # --- AI & Machine Learning ---
    "aiplatform": {
        "category": "AI & Machine Learning",
        "quadrant": "ai_ml",
        "name": "Vertex AI",
    },
    "vertex": {
        "category": "AI & Machine Learning",
        "quadrant": "ai_ml",
        "name": "Vertex AI",
    },

    # --- Data Platform ---
    "analyticshub": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Analytics Hub",
    },
    "biglake": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigLake",
    },
    "bigquery": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigQuery",
    },
    "bigqueryconnection": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigQuery Connection API",
    },
    "bigquerydatapolicy": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigQuery Data Policy",
    },
    "bigquerydatatransfer": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigQuery Data Transfer Service",
    },
    "bigqueryreservation": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "BigQuery Reservation",
    },
    "connectors": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Integration Connectors",
    },
    "datacatalog": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Data Catalog",
    },
    "dataform": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Dataform",
    },
    "datalineage": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Data Lineage",
    },
    "datapipelines": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Data Pipelines",
    },
    "dataplex": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Dataplex",
    },
    "integrations": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Application Integration",
    },
    "looker": {
        "category": "Data Platform",
        "quadrant": "data_platforms",
        "name": "Looker Core",
    },

    # --- FinOps & Billing ---
    "appoptimize": {
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "App Optimize",
    },
    "billingbudgets": {
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "Cloud Billing Budgets",
    },
    "cloudbilling": {
        "category": "FinOps & Billing",
        "quadrant": "security_finops",
        "name": "Cloud Billing",
    },

    # --- DevOps & Discovery ---
    "discovery": {
        "category": "DevOps & Discovery",
        "quadrant": "infra_compute",
        "name": "Discovery Engine",
    },

    # --- Analytics & Web ---
    "chromeuxreport": {
        "category": "Analytics & Web",
        "quadrant": "data_platforms",
        "name": "Chrome UX Report",
    },
    "pagespeedonline": {
        "category": "Analytics & Web",
        "quadrant": "data_platforms",
        "name": "PageSpeed Insights",
    },
    "searchconsole": {
        "category": "Analytics & Web",
        "quadrant": "data_platforms",
        "name": "Search Console",
    },
    "tagmanager": {
        "category": "Analytics & Web",
        "quadrant": "data_platforms",
        "name": "Tag Manager",
    },

    # --- Core & Datasets ---
    "abusiveexperiencereport": {
        "category": "Core & Other",
        "quadrant": "infra_compute",
        "name": "Abusive Experience Report",
    },
    "adexperiencereport": {
        "category": "Core & Other",
        "quadrant": "infra_compute",
        "name": "Ad Experience Report",
    },
    "safebrowsing": {
        "category": "Core & Other",
        "quadrant": "security_finops",
        "name": "Safe Browsing",
    },
    "versionhistory": {
        "category": "Core & Other",
        "quadrant": "infra_compute",
        "name": "Version History",
    },
    "webrisk": {
        "category": "Core & Other",
        "quadrant": "security_finops",
        "name": "Web Risk",
    },
}


def is_watched_api(api_name: str) -> bool:
    """Returns True if the API is on the watchlist."""
    return api_name.lower() in WATCHED_SERVICES


def get_watched_api_names() -> list[str]:
    """Returns a sorted list of all watched API names."""
    return sorted(WATCHED_SERVICES.keys())


def get_category_for_service(service_or_api: str) -> str:
    """
    Classifies a service or API name into a standardized category.
    Performs exact match first, then substring matching.
    """
    lower = service_or_api.lower()
    if lower in WATCHED_SERVICES:
        return WATCHED_SERVICES[lower].get("category", "Core & Other")

    for key, meta in WATCHED_SERVICES.items():
        if key in lower:
            return meta.get("category", "Core & Other")

    return "Core & Other"


def get_quadrant_for_service(service_or_api: str) -> str:
    """Returns the Thoughtworks Tech Radar quadrant for a given service."""
    category = get_category_for_service(service_or_api)
    return QUADRANT_MAP.get(category, "infra_compute")


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
    if status_lower in ("released", "ga") or "v1" in version_lower and "beta" not in version_lower and "alpha" not in version_lower:
        return "adopt"
    if "beta" in version_lower or "preview" in status_lower or "trial" in status_lower:
        return "trial"
    return "assess"
