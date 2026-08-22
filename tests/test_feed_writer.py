import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import feed_writer


def _insight(api="bigquery.v2", score=5):
    return {
        "api": api,
        "service_name": "BigQuery",
        "title": "BigQuery adds a useful flag",
        "summary": "A short summary.",
        "details": "More detail about the changed API surface.",
        "impact": "medium",
        "breaking": False,
        "tags": ["bigquery", "jobs"],
        "interesting_score": score,
    }


class TestFeedWriter(unittest.TestCase):
    def test_write_insight_creates_markdown_and_index_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            feed_dir = Path(tmp) / "feed"
            index_path = feed_dir / "index.json"

            with patch.object(feed_writer, "FEED_DIR", feed_dir), patch.object(
                feed_writer, "INDEX_PATH", index_path
            ):
                slug = feed_writer.write_insight(_insight(), insight_date="2026-04-17")

            self.assertEqual("2026-04-17-bigquery-v2", slug)
            markdown_path = feed_dir / "2026-04-17-bigquery-v2.md"
            self.assertTrue(markdown_path.exists())
            markdown = markdown_path.read_text(encoding="utf-8")
            self.assertIn("date: 2026-04-17", markdown)
            self.assertIn("api: bigquery.v2", markdown)
            self.assertIn("# BigQuery adds a useful flag", markdown)

            index = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertEqual(1, len(index))
            self.assertEqual("2026-04-17-bigquery-v2", index[0]["slug"])
            self.assertEqual("bigquery.v2", index[0]["api"])
            self.assertEqual(["bigquery", "jobs"], index[0]["tags"])

    def test_write_insight_versions_same_api_and_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            feed_dir = Path(tmp) / "feed"
            index_path = feed_dir / "index.json"

            with patch.object(feed_writer, "FEED_DIR", feed_dir), patch.object(
                feed_writer, "INDEX_PATH", index_path
            ):
                first = feed_writer.write_insight(_insight(), insight_date="2026-04-17")
                second = feed_writer.write_insight(
                    _insight(), insight_date="2026-04-17"
                )

            self.assertEqual("2026-04-17-bigquery-v2", first)
            self.assertEqual("2026-04-17-bigquery-v2", second)
            self.assertTrue((feed_dir / "2026-04-17-bigquery-v2.md").exists())

    def test_write_insight_skips_scores_below_threshold(self):
        with tempfile.TemporaryDirectory() as tmp:
            feed_dir = Path(tmp) / "feed"
            index_path = feed_dir / "index.json"

            with patch.object(feed_writer, "FEED_DIR", feed_dir), patch.object(
                feed_writer, "INDEX_PATH", index_path
            ):
                slug = feed_writer.write_insight(
                    _insight(score=1), insight_date="2026-04-17"
                )

            self.assertIsNone(slug)
            self.assertFalse(feed_dir.exists())


if __name__ == "__main__":
    unittest.main()
