"""
Writes LLM-generated API insights as structured JSON documents to data/changes/
and maintains data/index.json as a chronological manifest.
"""

import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
CHANGES_DIR = DATA_DIR / "changes"
INDEX_PATH = DATA_DIR / "index.json"

INTERESTING_SCORE_THRESHOLD = 2


def _slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _make_slug(api: str, insight_date: str) -> str:
    """e.g. 2026-08-22-aiplatform-v1beta1"""
    return f"{insight_date}-{_slugify(api)}"


def _load_index() -> list[dict]:
    if INDEX_PATH.exists():
        try:
            return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("data/index.json is malformed — starting fresh")
    return []


def _save_index(entries: list[dict]) -> None:
    INDEX_PATH.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(Path.cwd())
    except ValueError:
        return path


def get_recent_feed_entries(
    api: str, insight_date: str, max_entries: int = 3
) -> tuple[Optional[str], list[dict]]:
    """Look up index.json to find today's entry and recent past entries for the given api.

    Returns:
        A tuple: (existing_today_content_string, list_of_past_entries)
    """
    index = _load_index()
    api_entries = [e for e in index if e.get("api") == api]
    if not api_entries:
        return None, []

    api_entries.sort(key=lambda e: (e.get("date", ""), e.get("slug", "")), reverse=True)

    existing_today_content = None
    recent_history: list[dict] = []

    for entry in api_entries:
        entry_date = entry.get("date")
        slug = entry.get("slug") or entry.get("id")
        if not slug or not entry_date:
            continue

        json_path = CHANGES_DIR / f"{slug}.json"
        if not json_path.exists():
            continue

        try:
            doc = json.loads(json_path.read_text(encoding="utf-8"))
            summary = doc.get("summary", "")
            details = doc.get("details", "")
            content_str = f"Summary: {summary}\n\nDetails: {details}"
        except Exception as e:
            logger.warning(f"Failed to read data file {json_path}: {e}")
            continue

        if entry_date == insight_date:
            existing_today_content = content_str
        else:
            if len(recent_history) < max_entries:
                recent_history.append(
                    {"date": entry_date, "slug": slug, "content": content_str}
                )

    return existing_today_content, recent_history


def write_insight(insight: dict, insight_date: Optional[str] = None) -> Optional[str]:
    """Write a single insight as structured JSON to data/changes/{slug}.json.

    Args:
        insight: Parsed LLM output dict.
        insight_date: ISO date string (YYYY-MM-DD). Defaults to today UTC.

    Returns:
        The slug of the written file, or None if skipped.
    """
    score = insight.get("interesting_score", 0)
    api = insight.get("api", "unknown")

    if score < INTERESTING_SCORE_THRESHOLD:
        logger.info(
            f"  Skipping {api} (interesting_score={score} < {INTERESTING_SCORE_THRESHOLD})"
        )
        return None

    if insight_date is None:
        insight_date = date.today().isoformat()

    CHANGES_DIR.mkdir(parents=True, exist_ok=True)

    base_slug = _make_slug(api, insight_date)
    file_path = CHANGES_DIR / f"{base_slug}.json"
    final_slug = base_slug

    service_name = insight.get("service_name") or insight.get("service", "Google Cloud")
    title = insight.get("title") or f"{service_name} API Update"
    summary = insight.get("summary", "")
    details = insight.get("details", summary)
    impact = str(insight.get("impact", "low")).lower()
    breaking = bool(insight.get("breaking", False))
    tags = insight.get("tags", [])
    if isinstance(tags, str):
        tags = [tags]

    # Extract RPC methods if present
    extracted_methods = insight.get("extracted_methods", [])
    if not extracted_methods:
        method_matches = re.findall(r"`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})`", f"{summary} {details}")
        extracted_methods = list(dict.fromkeys(method_matches))[:6]

    entry = {
        "id": final_slug,
        "slug": final_slug,
        "date": insight_date,
        "api": api,
        "service": service_name,
        "service_name": service_name,
        "title": title,
        "summary": summary,
        "details": details,
        "impact": impact,
        "breaking": breaking,
        "interesting_score": score,
        "tags": tags,
        "extracted_methods": extracted_methods,
        "status": "canary",
        "radar_ring": "hold" if breaking else "assess",
        "lead_time_days": 14,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    is_update = file_path.exists()
    file_path.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if is_update:
        logger.info(f"  Updated: {_display_path(file_path)} (score={score})")
    else:
        logger.info(f"  Written: {_display_path(file_path)} (score={score})")

    # Update index
    index = _load_index()
    index_entry = {
        "id": final_slug,
        "slug": final_slug,
        "date": insight_date,
        "api": api,
        "service": service_name,
        "service_name": service_name,
        "title": title,
        "summary": summary,
        "impact": impact,
        "breaking": breaking,
        "interesting_score": score,
        "tags": tags,
        "extracted_methods": extracted_methods,
        "generated_at": entry["generated_at"],
    }

    # In case of update, replace existing entry in-place
    replaced = False
    for i, existing in enumerate(index):
        if existing.get("slug") == final_slug or existing.get("id") == final_slug:
            index[i] = index_entry
            replaced = True
            break

    if not replaced:
        index.append(index_entry)

    # Keep sorted newest-first
    index.sort(key=lambda e: (e["date"], e["slug"]), reverse=True)
    _save_index(index)

    return final_slug


def write_insights(
    insights: list[dict], insight_date: Optional[str] = None
) -> list[str]:
    """Write multiple insights to data/changes/.

    Returns:
        List of written slugs.
    """
    written = []
    for insight in insights:
        slug = write_insight(insight, insight_date)
        if slug:
            written.append(slug)
    return written
