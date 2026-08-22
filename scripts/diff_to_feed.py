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
        default="HEAD~1",
        help="Base git ref to diff against (default: HEAD~1).",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head git ref (default: HEAD).",
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
        logger.info(f"\nPublished {len(written)} insight(s) to feed/:")
        for slug in written:
            logger.info(f"  feed/{slug}.md")
    else:
        logger.info(
            "All insights were below the interesting_score threshold — feed unchanged."
        )


if __name__ == "__main__":
    main()
