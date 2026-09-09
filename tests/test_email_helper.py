import os
import unittest
from unittest.mock import MagicMock, patch

from scripts import email_helper


class TestEmailHelper(unittest.TestCase):
    def setUp(self):
        self.test_email = "recipient@example.com"
        self.secret = "test-secret-key-12345"

    def test_generate_and_verify_unsubscribe_token(self):
        token = email_helper.generate_unsubscribe_token(
            self.test_email, secret=self.secret
        )
        self.assertTrue(isinstance(token, str))
        self.assertEqual(64, len(token))

        # Verify valid token
        self.assertTrue(
            email_helper.verify_unsubscribe_token(
                self.test_email, token, secret=self.secret
            )
        )

        # Case and whitespace tolerance
        self.assertTrue(
            email_helper.verify_unsubscribe_token(
                "  RECIPIENT@EXAMPLE.COM ", token, secret=self.secret
            )
        )

    def test_verify_unsubscribe_token_tampered_or_invalid(self):
        valid_token = email_helper.generate_unsubscribe_token(
            self.test_email, secret=self.secret
        )

        # Tampered email
        self.assertFalse(
            email_helper.verify_unsubscribe_token(
                "other@example.com", valid_token, secret=self.secret
            )
        )

        # Tampered token
        tampered_token = valid_token[:-2] + "00"
        self.assertFalse(
            email_helper.verify_unsubscribe_token(
                self.test_email, tampered_token, secret=self.secret
            )
        )

        # Empty inputs
        self.assertFalse(
            email_helper.verify_unsubscribe_token("", valid_token, secret=self.secret)
        )
        self.assertFalse(
            email_helper.verify_unsubscribe_token(
                self.test_email, "", secret=self.secret
            )
        )

    def test_get_unsubscribe_headers_rfc8058(self):
        headers = email_helper.get_unsubscribe_headers(
            self.test_email, secret=self.secret
        )
        self.assertIn("List-Unsubscribe", headers)
        self.assertIn("List-Unsubscribe-Post", headers)
        self.assertEqual("List-Unsubscribe=One-Click", headers["List-Unsubscribe-Post"])

        list_unsub = headers["List-Unsubscribe"]
        self.assertTrue(
            list_unsub.startswith("<https://google-cloud-radar.com/api/unsubscribe?")
        )
        self.assertTrue(list_unsub.endswith(">"))
        self.assertIn("email=recipient%40example.com", list_unsub)
        self.assertIn("token=", list_unsub)

    def test_generate_unsubscribe_urls(self):
        api_url = email_helper.generate_unsubscribe_url(
            self.test_email, secret=self.secret
        )
        self.assertIn("/api/unsubscribe?", api_url)
        self.assertIn("email=recipient%40example.com", api_url)

        page_url = email_helper.generate_unsubscribe_page_url(
            self.test_email, secret=self.secret
        )
        self.assertIn("/unsubscribe?", page_url)
        self.assertIn("email=recipient%40example.com", page_url)

    @patch("urllib.request.urlopen")
    def test_send_resend_email_injects_rfc8058_headers(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "msg_rfc8058_123"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        success = email_helper.send_resend_email(
            api_key="re_mock_key",
            from_email="Google Cloud Radar <alerts@google-cloud-radar.com>",
            to_email=self.test_email,
            subject="RFC 8058 Test",
            html_content="<p>Test</p>",
        )
        self.assertTrue(success)

        # Inspect request payload sent to Resend API
        self.assertEqual(1, mock_urlopen.call_count)
        req = mock_urlopen.call_args[0][0]
        import json

        payload = json.loads(req.data.decode("utf-8"))
        self.assertIn("headers", payload)
        self.assertIn("List-Unsubscribe", payload["headers"])
        self.assertEqual(
            "List-Unsubscribe=One-Click", payload["headers"]["List-Unsubscribe-Post"]
        )

    @patch("urllib.request.urlopen")
    def test_unsubscribe_user_in_firestore(self, mock_urlopen):
        # Mock Firestore documents list response
        mock_list_resp = MagicMock()
        mock_list_resp.read.return_value = json_bytes(
            {
                "documents": [
                    {
                        "name": "projects/gcp-cloud-radar/databases/radar/documents/users/user_1",
                        "fields": {
                            "email": {"stringValue": "recipient@example.com"},
                            "breakingAlerts": {"booleanValue": True},
                            "weeklyDigest": {"booleanValue": True},
                        },
                    }
                ]
            }
        )

        mock_patch_resp = MagicMock()
        mock_patch_resp.read.return_value = b"{}"

        mock_urlopen.side_effect = [
            MagicMock(__enter__=MagicMock(return_value=mock_list_resp)),
            MagicMock(__enter__=MagicMock(return_value=mock_patch_resp)),
        ]

        result = email_helper.unsubscribe_user_in_firestore(
            email=self.test_email, auth_token="mock-token-abc"
        )
        self.assertTrue(result)


def json_bytes(obj):
    import json

    return json.dumps(obj).encode("utf-8")


if __name__ == "__main__":
    unittest.main()
