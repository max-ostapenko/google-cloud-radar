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
        self.assertIn("Vertex AI", html)
        self.assertIn("BigQuery", html)
        self.assertIn("https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1", html)
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


if __name__ == "__main__":
    unittest.main()
