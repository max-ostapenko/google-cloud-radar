import os
import unittest
from unittest.mock import patch, MagicMock

from scripts import dispatch_weekly_digest


class TestDispatchWeeklyDigest(unittest.TestCase):
    def setUp(self):
        self.sample_changes = [
            {
                "slug": "2026-08-30-aiplatform-v1beta1",
                "date": "2026-08-30",
                "service": "Vertex AI",
                "api": "aiplatform.v1beta1",
                "title": "Vertex AI: Breaking Changes & Agent IAM Controls",
                "summary": "Mandatory resource parameters added and deprecated methods removed.",
                "impact": "high",
                "breaking": True,
                "extracted_methods": ["publishers.v1beta1.compact"],
                "lead_time_days": 14,
                "breaking_reasons": ["Removed method 'transcribe'"],
            },
            {
                "slug": "2026-08-28-bigquery-v2",
                "date": "2026-08-28",
                "service": "BigQuery",
                "api": "bigquery.v2",
                "title": "BigQuery adds fine-grained reservation parameters",
                "summary": "Added scaling metrics to reservation configs.",
                "impact": "medium",
                "breaking": False,
                "extracted_methods": ["jobs.query.stats"],
            },
        ]

    def test_render_weekly_digest_html(self):
        html = dispatch_weekly_digest.render_weekly_digest_html(
            self.sample_changes, week_label="Week of August 31, 2026"
        )
        self.assertIn("Google Cloud", html)
        self.assertIn("Week of August 31, 2026", html)
        self.assertIn("Breaking Changes (1)", html)
        self.assertIn("New Features & Schema Updates (1)", html)
        self.assertIn("Vertex AI", html)
        self.assertIn("BigQuery", html)
        self.assertIn(
            "https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1", html
        )
        self.assertIn("https://google-cloud-radar.com/?action=alerts", html)

    def test_filter_changes_for_subscriber(self):
        sub_all = {"all_services": True, "watched_services": []}
        matched_all = dispatch_weekly_digest.filter_changes_for_subscriber(
            self.sample_changes, sub_all
        )
        self.assertEqual(2, len(matched_all))

        sub_vertex = {"all_services": False, "watched_services": ["vertex-ai"]}
        matched_vertex = dispatch_weekly_digest.filter_changes_for_subscriber(
            self.sample_changes, sub_vertex
        )
        self.assertEqual(1, len(matched_vertex))
        self.assertEqual("Vertex AI", matched_vertex[0]["service"])

        sub_none = {"all_services": False, "watched_services": ["non-existent-service"]}
        matched_none = dispatch_weekly_digest.filter_changes_for_subscriber(
            self.sample_changes, sub_none
        )
        self.assertEqual(0, len(matched_none))

    @patch("urllib.request.urlopen")
    def test_send_resend_email_digest_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "digest_msg_12345"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        success = dispatch_weekly_digest.send_resend_email(
            api_key="re_test_key",
            from_email="Google Cloud Radar <alerts@google-cloud-radar.com>",
            to_email="test@example.com",
            subject="Weekly Digest",
            html_content="<p>Weekly Updates</p>",
        )
        self.assertTrue(success)

    @patch("scripts.dispatch_weekly_digest.CHANGES_DIR")
    def test_load_recent_changes_strict_window(self, mock_changes_dir):
        import datetime
        import tempfile
        import json
        from pathlib import Path

        today = datetime.date.today()
        recent_date = (today - datetime.timedelta(days=2)).isoformat()
        old_date = (today - datetime.timedelta(days=20)).isoformat()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            mock_changes_dir.exists.return_value = True

            recent_file = tmp_path / "2026-08-30-recent.json"
            old_file = tmp_path / "2026-08-10-old.json"

            with open(recent_file, "w") as f:
                json.dump({"slug": "recent", "date": recent_date}, f)

            with open(old_file, "w") as f:
                json.dump({"slug": "old", "date": old_date}, f)

            mock_changes_dir.glob.side_effect = tmp_path.glob

            changes = dispatch_weekly_digest.load_recent_changes(days=7)
            self.assertEqual(1, len(changes))
            self.assertEqual("recent", changes[0]["slug"])

    @patch("scripts.dispatch_weekly_digest.CHANGES_DIR")
    def test_load_recent_changes_empty_when_out_of_window(self, mock_changes_dir):
        import datetime
        import tempfile
        import json
        from pathlib import Path

        today = datetime.date.today()
        old_date = (today - datetime.timedelta(days=30)).isoformat()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            mock_changes_dir.exists.return_value = True

            old_file = tmp_path / "2026-08-01-old.json"
            with open(old_file, "w") as f:
                json.dump({"slug": "old", "date": old_date}, f)

            mock_changes_dir.glob.side_effect = tmp_path.glob

            changes = dispatch_weekly_digest.load_recent_changes(days=7)
            self.assertEqual(0, len(changes))

    @patch("sys.argv", ["dispatch_weekly_digest.py", "--dry-run"])
    @patch("scripts.dispatch_weekly_digest.send_resend_email")
    @patch("scripts.dispatch_weekly_digest.load_recent_changes")
    def test_main_exits_cleanly_when_no_changes(self, mock_load, mock_send):
        mock_load.return_value = []
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_dummy"}, clear=False):
            with self.assertRaises(SystemExit) as cm:
                dispatch_weekly_digest.main()
            self.assertEqual(0, cm.exception.code)
            mock_send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
