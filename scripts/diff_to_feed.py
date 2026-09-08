"""
Orchestrator: extracts structured diffs, calls the LLM for each API,
and writes insights to the feed.

Usage:
    python scripts/diff_to_feed.py                  # normal run (HEAD~1..HEAD)
    python scripts/diff_to_feed.py --dry-run         # print diffs only, no LLM/feed
    python scripts/diff_to_feed.py --base <ref>      # compare against a specific ref
"""

import argparse
import json
import logging
from datetime import date
import sys
from pathlib import Path

# Allow running as `python scripts/diff_to_feed.py` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.diff_preprocessor import extract_structured_diffs
from scripts.feed_writer import write_insights, get_recent_feed_entries
from scripts.llm_client import analyze_api_diff


def extract_method_and_path_metadata(diff: dict) -> tuple[set[str], set[str]]:
    """Extract sets of lowercased method identifiers and target schema paths from a diff."""
    methods: set[str] = set()
    paths: set[str] = set()

    if "extracted_methods" in diff:
        methods.update(m.lower() for m in diff["extracted_methods"])
    if "target_paths" in diff:
        paths.update(p.lower() for p in diff["target_paths"])

    if not methods or not paths:
        raw_paths = set()
        for cat in ("added", "removed", "modified"):
            for entry in diff.get(cat, []):
                p = entry.get("path")
                if p:
                    raw_paths.add(p.lower())
        if not paths:
            paths = raw_paths
        if not methods:
            from scripts.diff_preprocessor import (
                extract_method_identifiers_from_paths,
            )

            methods = set(extract_method_identifiers_from_paths(raw_paths))

    return methods, paths


def is_duplicate_diff(diff: dict, recent_history: list[dict]) -> tuple[bool, str]:
    """Check if the changes in diff are identical to structured metadata in recent history."""
    if not recent_history:
        return False, ""

    diff_methods, diff_paths = extract_method_and_path_metadata(diff)

    if not diff_methods and not diff_paths:
        return False, ""

    for entry in recent_history:
        slug = entry.get("slug", "")
        date_str = entry.get("date", "")

        hist_methods = {m.lower() for m in entry.get("extracted_methods", [])}
        hist_paths = {
            p.lower()
            for p in (
                entry.get("target_paths")
                or entry.get("extracted_paths")
                or entry.get("target_schema_paths")
                or []
            )
        }

        if not hist_paths and not hist_methods:
            continue

        if diff_methods == hist_methods and diff_paths == hist_paths:
            return (
                True,
                f"Identical method set ({sorted(diff_methods)}) and target path metadata ({sorted(diff_paths)}) match historical change {slug} ({date_str})",
            )

    return False, ""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate API change insights and write to feed."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print structured diffs only; do not call LLM or write feed files.",
    )
    parser.add_argument(
        "--base",
        default="HEAD",
        help="Base git ref to diff against (default: HEAD).",
    )
    parser.add_argument(
        "--head",
        default="WORKTREE",
        help="Head git ref (default: WORKTREE uncommitted changes).",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="Override insight date (YYYY-MM-DD). Defaults to today UTC.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(levelname)s %(message)s",
    )
    logger = logging.getLogger(__name__)

    # Step 1: Extract and pre-process diffs
    structured_diffs = extract_structured_diffs(base_ref=args.base, head_ref=args.head)

    if not structured_diffs:
        logger.info("No meaningful API changes found — nothing to publish.")
        sys.exit(0)

    if args.dry_run:
        print(f"\n{'='*60}")
        print(f"DRY RUN — {len(structured_diffs)} structured diff(s):")
        print(f"{'='*60}\n")
        for diff in structured_diffs:
            stats = diff.pop("_stats", {})
            print(json.dumps(diff, indent=2))
            print(f"  Stats: {stats}\n")
        sys.exit(0)

    # Step 2: Call LLM for each API diff
    insights = []
    insight_date = args.date or date.today().isoformat()
    for diff in structured_diffs:
        api = diff.get("api", "unknown")

        existing_today_content = None
        recent_history_content = None

        existing_today_content, recent_history = get_recent_feed_entries(
            api, insight_date
        )
        if existing_today_content:
            logger.info(
                f"Found existing feed entry for {api} today. Will request LLM merge."
            )
        if recent_history:
            is_dup, reason = is_duplicate_diff(diff, recent_history)
            if is_dup:
                logger.info(
                    f"  Skipping {api}: duplicate of recent historical change ({reason})."
                )
                continue

            logger.info(
                f"Found {len(recent_history)} recent historical feed entries for {api}. Will pass as context."
            )
            recent_history_content = "\n\n".join(
                f"--- Entry Date: {h['date']} (Slug: {h['slug']}) ---\n{h['content']}"
                for h in recent_history
            )

        insight = analyze_api_diff(
            diff,
            existing_today_content=existing_today_content,
            recent_history_content=recent_history_content,
        )
        if insight:
            # Deterministic ground truth override: ensure breaking flag always reflects AST schema analysis
            if diff.get("is_breaking") is not None:
                insight["breaking"] = bool(diff.get("is_breaking"))
            methods, paths = extract_method_and_path_metadata(diff)
            insight["extracted_methods"] = sorted(list(methods))
            insight["target_paths"] = sorted(list(paths))
            insights.append(insight)
        else:
            logger.warning(
                f"  No insight returned for {api} (LLM unavailable or failed)"
            )

    if not insights:
        logger.info("No insights generated — feed unchanged.")
        sys.exit(0)

    # Step 3: Write to feed
    insight_date = args.date or date.today().isoformat()
    written = write_insights(insights, insight_date=insight_date)

    if written:
        logger.info(f"\nPublished {len(written)} insight(s) to data/:")
        for slug in written:
            logger.info(f"  data/changes/{slug}.json")
    else:
        logger.info(
            "All insights were below the interesting_score threshold — feed unchanged."
        )


if __name__ == "__main__":
    main()
