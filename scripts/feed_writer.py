"""
Writes LLM-generated API insights to the feed/ directory.

One Markdown file per API per insight date.
If the same API is updated multiple times on the same day, a _v2, _v3 suffix is used.
Maintains feed/index.json as a manifest for future deduplication and enhancement.
"""

import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

FEED_DIR = Path(__file__).parent.parent / "feed"
INDEX_PATH = FEED_DIR / "index.json"

INTERESTING_SCORE_THRESHOLD = 3


def _slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _make_slug(api: str, insight_date: str) -> str:
    """e.g. 2026-04-16-bigquery-v2"""
    return f"{insight_date}-{_slugify(api)}"


def _find_available_path(base_slug: str) -> tuple[Path, str]:
    """Return an available file path and final slug (adds _v2, _v3 if needed)."""
    candidate_path = FEED_DIR / f"{base_slug}.md"
    if not candidate_path.exists():
        return candidate_path, base_slug

    for v in range(2, 100):
        versioned_slug = f"{base_slug}_v{v}"
        versioned_path = FEED_DIR / f"{versioned_slug}.md"
        if not versioned_path.exists():
            return versioned_path, versioned_slug

    raise RuntimeError(f"Could not find an available path for slug {base_slug}")


def _load_index() -> list[dict]:
    if INDEX_PATH.exists():
        try:
            return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("feed/index.json is malformed — starting fresh")
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


def _render_markdown(insight: dict, slug: str, insight_date: str) -> str:
    tags_yaml = json.dumps(insight.get("tags", []))
    breaking = "true" if insight.get("breaking") else "false"

    lines = [
        "---",
        f"date: {insight_date}",
        f"api: {insight.get('api', '')}",
        f"service: {insight.get('service_name', '')}",
        f'title: "{insight.get("title", "")}"',
        f"impact: {insight.get('impact', 'low')}",
        f"breaking: {breaking}",
        f"tags: {tags_yaml}",
        f"interesting_score: {insight.get('interesting_score', 0)}",
        "---",
        "",
        f"# {insight.get('title', insight.get('api', 'API Update'))}",
        "",
        f"**Date:** {insight_date}  ",
        f"**API:** `{insight.get('api', '')}`  ",
        f"**Impact:** {insight.get('impact', 'low').capitalize()}  ",
    ]

    if insight.get("breaking"):
        lines.append("**⚠️ Breaking change**  ")

    lines += [
        "",
        "## Summary",
        "",
        insight.get("summary", ""),
        "",
        "## Details",
        "",
        insight.get("details", ""),
        "",
    ]

    tags = insight.get("tags", [])
    if tags:
        tag_str = " ".join(f"`{t}`" for t in tags)
        lines += [f"**Tags:** {tag_str}", ""]

    return "\n".join(lines)


def get_recent_feed_entries(
    api: str, insight_date: str, max_entries: int = 3
) -> tuple[Optional[str], list[dict]]:
    """Look up index.json to find today's entry and recent past entries for the given api.

    Args:
        api: The API ID.
        insight_date: ISO date string for today (YYYY-MM-DD).
        max_entries: Max past entries to return.

    Returns:
        A tuple: (existing_today_content_string, list_of_past_entries)
        Each past entry is a dict: {"date": str, "slug": str, "content": str}
    """
    index = _load_index()
    api_entries = [e for e in index if e.get("api") == api]
    if not api_entries:
        return None, []

    # Sort by date descending, then slug descending to find the newest first
    api_entries.sort(key=lambda e: (e.get("date", ""), e.get("slug", "")), reverse=True)

    existing_today_content = None
    recent_history: list[dict] = []

    for entry in api_entries:
        entry_date = entry.get("date")
        slug = entry.get("slug")
        if not slug or not entry_date:
            continue

        md_path = FEED_DIR / f"{slug}.md"
        if not md_path.exists():
            continue

        try:
            content = md_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to read feed file {md_path}: {e}")
            continue

        if entry_date == insight_date:
            existing_today_content = content
        else:
            if len(recent_history) < max_entries:
                recent_history.append(
                    {"date": entry_date, "slug": slug, "content": content}
                )

    return existing_today_content, recent_history


def write_insight(insight: dict, insight_date: Optional[str] = None) -> Optional[str]:
    """Write a single insight to the feed.

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

    FEED_DIR.mkdir(parents=True, exist_ok=True)

    base_slug = _make_slug(api, insight_date)
    file_path = FEED_DIR / f"{base_slug}.md"
    final_slug = base_slug

    is_update = file_path.exists()

    md_content = _render_markdown(insight, final_slug, insight_date)
    file_path.write_text(md_content, encoding="utf-8")
    if is_update:
        logger.info(f"  Updated: {_display_path(file_path)} (score={score})")
    else:
        logger.info(f"  Written: {_display_path(file_path)} (score={score})")

    # Update index
    index = _load_index()
    index_entry = {
        "slug": final_slug,
        "date": insight_date,
        "api": api,
        "service_name": insight.get("service_name", ""),
        "title": insight.get("title", ""),
        "impact": insight.get("impact", "low"),
        "breaking": bool(insight.get("breaking")),
        "tags": insight.get("tags", []),
        "interesting_score": score,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # In case of update, replace existing entry in-place
    replaced = False
    for i, entry in enumerate(index):
        if entry.get("slug") == final_slug:
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
    """Write multiple insights (one per API) to the feed.

    Returns:
        List of written slugs.
    """
    written = []
    for insight in insights:
        slug = write_insight(insight, insight_date)
        if slug:
            written.append(slug)
    return written
