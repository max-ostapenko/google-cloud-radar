import os
import unittest
from unittest.mock import patch, MagicMock

from scripts import dispatch_email_alerts


class TestDispatchEmailAlerts(unittest.TestCase):
    def setUp(self):
        self.sample_change = {
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
        }

    def test_render_breaking_email_html(self):
        html = dispatch_email_alerts.render_breaking_email_html(self.sample_change)
        self.assertIn("Vertex AI", html)
        self.assertIn("Vertex AI: Breaking Changes & Agent IAM Controls", html)
        self.assertIn("https://google-cloud-radar.com/changes/2026-08-30-aiplatform-v1beta1", html)
        self.assertIn("https://google-cloud-radar.com/?action=alerts", html)
        self.assertIn("publishers.v1beta1.compact", html)

    def test_is_service_watched(self):
        # All services subscriber
        sub_all = {"email": "user@example.com", "all_services": True, "watched_services": []}
        self.assertTrue(dispatch_email_alerts.is_service_watched(sub_all, "vertex-ai"))
        self.assertTrue(dispatch_email_alerts.is_service_watched(sub_all, "bigquery"))

        # Specific services subscriber
        sub_specific = {
            "email": "dev@example.com",
            "all_services": False,
            "watched_services": ["vertex-ai", "dataform"],
        }
        self.assertTrue(dispatch_email_alerts.is_service_watched(sub_specific, "vertex-ai"))
        self.assertFalse(dispatch_email_alerts.is_service_watched(sub_specific, "bigquery"))

    @patch.dict(os.environ, {"ENVIRONMENT": "production", "CI": "false"}, clear=True)
    def test_is_dev_environment_production(self):
        self.assertFalse(dispatch_email_alerts.is_dev_environment())

    @patch.dict(os.environ, {"CI": "true"}, clear=True)
    def test_is_dev_environment_ci(self):
        self.assertFalse(dispatch_email_alerts.is_dev_environment())

    @patch.dict(os.environ, {}, clear=True)
    def test_is_dev_environment_local_dev(self):
        self.assertTrue(dispatch_email_alerts.is_dev_environment())

    @patch("urllib.request.urlopen")
    def test_send_resend_email_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "msg_12345"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        success = dispatch_email_alerts.send_resend_email(
            api_key="re_test_key",
            from_email="Google Cloud Radar <alerts@google-cloud-radar.com>",
            to_email="test@example.com",
            subject="Test Subject",
            html_content="<p>Test</p>",
        )
        self.assertTrue(success)


if __name__ == "__main__":
    unittest.main()
