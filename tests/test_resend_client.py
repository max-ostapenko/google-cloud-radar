import io
import json
import unittest
from urllib.error import HTTPError
from unittest.mock import MagicMock, patch

from scripts.resend_client import (
    ResendClient,
    DispatchItem,
    FALLBACK_SANDBOX_FROM_EMAIL,
)


class TestResendClient(unittest.TestCase):
    def setUp(self):
        self.mock_sleep = MagicMock()
        self.client = ResendClient(
            api_key="re_test_key_123",
            max_retries=2,
            initial_backoff=0.5,
            max_backoff=5.0,
            backoff_factor=2.0,
            sleep_fn=self.mock_sleep,
        )

    @patch("urllib.request.urlopen")
    def test_send_email_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "resend_msg_1001"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        success = self.client.send_email(
            to_email="subscriber@example.com",
            subject="Test Breaking Alert",
            html_content="<p>Breaking Change</p>",
        )

        self.assertTrue(success)
        self.mock_sleep.assert_not_called()

    @patch("urllib.request.urlopen")
    def test_send_email_429_with_retry_after_seconds(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "resend_msg_429_recovered"}'

        err_429 = HTTPError(
            url="https://api.resend.com/emails",
            code=429,
            msg="Too Many Requests",
            hdrs={"Retry-After": "3.5"},
            fp=io.BytesIO(b'{"message": "Rate limit exceeded"}'),
        )

        # 1st call raises 429, 2nd call succeeds
        mock_urlopen.side_effect = [
            err_429,
            MagicMock(__enter__=MagicMock(return_value=mock_resp)),
        ]

        success = self.client.send_email(
            to_email="subscriber@example.com",
            subject="Test Rate Limit Handling",
            html_content="<p>Content</p>",
        )

        self.assertTrue(success)
        self.assertEqual(mock_urlopen.call_count, 2)
        self.mock_sleep.assert_called_once_with(3.5)

    @patch("urllib.request.urlopen")
    def test_send_email_429_without_retry_after_exponential_backoff(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "resend_msg_exp_recovered"}'

        err_429 = HTTPError(
            url="https://api.resend.com/emails",
            code=429,
            msg="Too Many Requests",
            hdrs={},
            fp=io.BytesIO(b'{"message": "Too many requests"}'),
        )

        # 1st call raises 429, 2nd call succeeds
        mock_urlopen.side_effect = [
            err_429,
            MagicMock(__enter__=MagicMock(return_value=mock_resp)),
        ]

        success = self.client.send_email(
            to_email="subscriber@example.com",
            subject="Test Exponential Backoff",
            html_content="<p>Content</p>",
        )

        self.assertTrue(success)
        self.assertEqual(mock_urlopen.call_count, 2)
        self.mock_sleep.assert_called_once_with(0.5)

    @patch("urllib.request.urlopen")
    def test_send_email_exhausts_retries(self, mock_urlopen):
        err_500 = HTTPError(
            url="https://api.resend.com/emails",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=io.BytesIO(b'{"message": "Internal error"}'),
        )

        mock_urlopen.side_effect = err_500

        success = self.client.send_email(
            to_email="subscriber@example.com",
            subject="Test Retries Exhausted",
            html_content="<p>Content</p>",
        )

        self.assertFalse(success)
        # max_retries = 2 means 3 attempts total
        self.assertEqual(mock_urlopen.call_count, 3)
        self.assertEqual(self.mock_sleep.call_count, 2)

    @patch("urllib.request.urlopen")
    def test_send_email_dev_sandbox_fallback(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"id": "sandbox_msg_99"}'

        err_403 = HTTPError(
            url="https://api.resend.com/emails",
            code=403,
            msg="Forbidden",
            hdrs={},
            fp=io.BytesIO(b'{"message": "The domain is not verified"}'),
        )

        mock_urlopen.side_effect = [
            err_403,
            MagicMock(__enter__=MagicMock(return_value=mock_resp)),
        ]

        success = self.client.send_email(
            to_email="dev@example.com",
            subject="Test Sandbox Fallback",
            html_content="<p>Content</p>",
            from_email="custom@unverified.com",
            allow_dev_fallback=True,
        )

        self.assertTrue(success)
        self.assertEqual(mock_urlopen.call_count, 2)
        # Verify second call used sandbox domain
        second_call_req = mock_urlopen.call_args_list[1][0][0]
        req_data = json.loads(second_call_req.data.decode("utf-8"))
        self.assertEqual(req_data["from"], FALLBACK_SANDBOX_FROM_EMAIL)

    def test_dispatch_batch_primary_and_secondary_recovery(self):
        record_calls = []

        def record_fn(item: DispatchItem):
            record_calls.append(item.to_email)

        items = [
            DispatchItem(
                "user1@example.com", "Subject 1", "<p>1</p>", record_sent_fn=record_fn
            ),
            DispatchItem(
                "user2@example.com", "Subject 2", "<p>2</p>", record_sent_fn=record_fn
            ),
            DispatchItem(
                "user3@example.com", "Subject 3", "<p>3</p>", record_sent_fn=record_fn
            ),
        ]

        # Define behavior for send_email:
        # Pass 1:
        #   user1 -> True (primary success)
        #   user2 -> False (primary fail)
        #   user3 -> False (primary fail)
        # Pass 2 (Secondary Recovery):
        #   user2 -> True (secondary recovery success)
        #   user3 -> False (secondary recovery fail)
        call_results = {
            "user1@example.com": [True],
            "user2@example.com": [False, True],
            "user3@example.com": [False, False],
        }

        def mock_send_email(to_email, **kwargs):
            return call_results[to_email].pop(0)

        with patch.object(self.client, "send_email", side_effect=mock_send_email):
            result = self.client.dispatch_batch(items, secondary_pass_delay=1.0)

        self.assertEqual(result.total_requested, 3)
        self.assertEqual(result.primary_sent, 1)
        self.assertEqual(result.secondary_sent, 1)
        self.assertEqual(result.failed_count, 1)
        self.assertEqual(result.total_sent, 2)

        # Delivery log recorded for user1 (primary) and user2 (secondary recovery)
        self.assertEqual(record_calls, ["user1@example.com", "user2@example.com"])
        self.mock_sleep.assert_called_with(1.0)


if __name__ == "__main__":
    unittest.main()
