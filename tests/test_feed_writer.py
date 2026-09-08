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
    def test_write_insight_creates_json_and_index_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            changes_dir = data_dir / "changes"
            index_path = data_dir / "index.json"

            with patch.object(feed_writer, "DATA_DIR", data_dir), patch.object(
                feed_writer, "CHANGES_DIR", changes_dir
            ), patch.object(feed_writer, "INDEX_PATH", index_path):
                slug = feed_writer.write_insight(_insight(), insight_date="2026-04-17")

            self.assertEqual("2026-04-17-bigquery-v2", slug)
            json_path = changes_dir / "2026-04-17-bigquery-v2.json"
            self.assertTrue(json_path.exists())
            doc = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual("2026-04-17", doc["date"])
            self.assertEqual("bigquery.v2", doc["api"])
            self.assertEqual("BigQuery adds a useful flag", doc["title"])
            self.assertEqual("BigQuery", doc["service_name"])

            index = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertEqual(1, len(index))
            self.assertEqual("2026-04-17-bigquery-v2", index[0]["slug"])
            self.assertEqual("bigquery.v2", index[0]["api"])
            self.assertEqual(["bigquery", "jobs"], index[0]["tags"])

    def test_write_insight_persists_methods_and_target_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            changes_dir = data_dir / "changes"
            index_path = data_dir / "index.json"

            insight = _insight()
            insight["extracted_methods"] = ["jobs.get"]
            insight["target_paths"] = ["schemas.Job.properties.status.type"]

            with patch.object(feed_writer, "DATA_DIR", data_dir), patch.object(
                feed_writer, "CHANGES_DIR", changes_dir
            ), patch.object(feed_writer, "INDEX_PATH", index_path):
                slug = feed_writer.write_insight(insight, insight_date="2026-04-17")
                today_content, recent_history = feed_writer.get_recent_feed_entries(
                    "bigquery.v2", "2026-04-18"
                )

            json_path = changes_dir / f"{slug}.json"
            doc = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(["jobs.get"], doc["extracted_methods"])
            self.assertEqual(
                ["schemas.Job.properties.status.type"], doc["target_paths"]
            )

            index = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertEqual(["jobs.get"], index[0]["extracted_methods"])
            self.assertEqual(
                ["schemas.Job.properties.status.type"], index[0]["target_paths"]
            )

            self.assertEqual(1, len(recent_history))
            self.assertEqual(["jobs.get"], recent_history[0]["extracted_methods"])
            self.assertEqual(
                ["schemas.Job.properties.status.type"],
                recent_history[0]["target_paths"],
            )

    def test_write_insight_updates_in_place_for_same_api_and_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            changes_dir = data_dir / "changes"
            index_path = data_dir / "index.json"

            with patch.object(feed_writer, "DATA_DIR", data_dir), patch.object(
                feed_writer, "CHANGES_DIR", changes_dir
            ), patch.object(feed_writer, "INDEX_PATH", index_path):
                first = feed_writer.write_insight(_insight(), insight_date="2026-04-17")
                second = feed_writer.write_insight(
                    _insight(score=7), insight_date="2026-04-17"
                )

            self.assertEqual("2026-04-17-bigquery-v2", first)
            self.assertEqual("2026-04-17-bigquery-v2", second)
            self.assertTrue((changes_dir / "2026-04-17-bigquery-v2.json").exists())
            index = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertEqual(1, len(index))
            self.assertEqual(7, index[0]["interesting_score"])

    def test_write_insight_skips_scores_below_threshold(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            changes_dir = data_dir / "changes"
            index_path = data_dir / "index.json"

            with patch.object(feed_writer, "DATA_DIR", data_dir), patch.object(
                feed_writer, "CHANGES_DIR", changes_dir
            ), patch.object(feed_writer, "INDEX_PATH", index_path):
                slug = feed_writer.write_insight(
                    _insight(score=1), insight_date="2026-04-17"
                )

            self.assertIsNone(slug)
            self.assertFalse(changes_dir.exists())


if __name__ == "__main__":
    unittest.main()
