#!/usr/bin/env python3
"""
Dedicated Resend Client with Adaptive Backoff & Secondary Pass Recovery.

Centralized client for dispatching email requests to Resend REST API,
handling HTTP 429 rate limiting with Retry-After header parsing,
exponential backoff, and secondary pass recovery for failed recipient deliveries.
"""

import datetime
import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Optional

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_EMAIL = "Google Cloud Radar <alerts@google-cloud-radar.com>"
FALLBACK_SANDBOX_FROM_EMAIL = "Google Cloud Radar <onboarding@resend.dev>"

logger = logging.getLogger("resend_client")


@dataclass
class DispatchItem:
    to_email: str
    subject: str
    html_content: str
    text_content: Optional[str] = None
    from_email: Optional[str] = None
    allow_dev_fallback: bool = False
    context: Optional[dict[str, Any]] = None
    record_sent_fn: Optional[Callable[["DispatchItem"], None]] = None


@dataclass
class BatchResult:
    total_requested: int
    primary_sent: int
    secondary_sent: int
    failed_count: int

    @property
    def total_sent(self) -> int:
        return self.primary_sent + self.secondary_sent


class ResendClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        default_from_email: str = DEFAULT_FROM_EMAIL,
        max_retries: int = 3,
        initial_backoff: float = 1.0,
        max_backoff: float = 32.0,
        backoff_factor: float = 2.0,
        sleep_fn: Optional[Callable[[float], None]] = None,
    ):
        self.api_key = api_key or os.getenv("RESEND_API_KEY", "")
        self.default_from_email = default_from_email
        self.max_retries = max_retries
        self.initial_backoff = initial_backoff
        self.max_backoff = max_backoff
        self.backoff_factor = backoff_factor
        self.sleep_fn = sleep_fn or time.sleep

    def parse_retry_after(self, headers: Any) -> Optional[float]:
        """Parses Retry-After header from HTTP response headers."""
        if not headers:
            return None

        retry_after_val = None
        for k, v in headers.items():
            if k.lower() == "retry-after":
                retry_after_val = str(v).strip()
                break

        if not retry_after_val:
            return None

        # Try parsing integer/float seconds
        try:
            return float(retry_after_val)
        except ValueError:
            pass

        # Try parsing HTTP date string
        try:
            from email.utils import parsedate_to_datetime

            dt = parsedate_to_datetime(retry_after_val)
            now = datetime.datetime.now(datetime.timezone.utc)
            delta = (dt - now).total_seconds()
            return max(0.0, delta)
        except Exception:
            pass

        return None

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        from_email: Optional[str] = None,
        allow_dev_fallback: bool = False,
        api_key: Optional[str] = None,
    ) -> bool:
        """Sends an email via Resend API with adaptive rate-limit backoff."""
        effective_api_key = api_key or self.api_key
        effective_from = from_email or self.default_from_email

        if not effective_api_key:
            logger.error("Cannot send email: missing Resend API key.")
            return False

        headers = {
            "Authorization": f"Bearer {effective_api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Google-Cloud-Radar-Dispatcher/1.0",
        }

        payload: dict[str, Any] = {
            "from": effective_from,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        if text_content:
            payload["text"] = text_content

        data = json.dumps(payload).encode("utf-8")

        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(
                RESEND_API_URL, data=data, headers=headers, method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp_body = resp.read().decode("utf-8")
                    result = json.loads(resp_body) if resp_body else {}
                    resend_id = result.get("id", "N/A")
                    logger.info(
                        f"✓ Email successfully sent to {to_email} (Resend ID: {resend_id})"
                    )
                    return True
            except urllib.error.HTTPError as e:
                error_body = e.read().decode("utf-8") if e.fp else ""

                # 1. Handle HTTP 429 Rate Limit
                if e.code == 429:
                    retry_after_sec = self.parse_retry_after(e.headers)
                    if retry_after_sec is not None:
                        delay = min(self.max_backoff, retry_after_sec)
                        logger.warning(
                            f"Rate limit hit (429) for {to_email}. Retry-After indicates wait {retry_after_sec:.2f}s (sleeping {delay:.2f}s, attempt {attempt + 1}/{self.max_retries + 1})..."
                        )
                    else:
                        delay = min(
                            self.max_backoff,
                            self.initial_backoff * (self.backoff_factor**attempt),
                        )
                        logger.warning(
                            f"Rate limit hit (429) for {to_email} without Retry-After header. Applying exponential backoff ({delay:.2f}s, attempt {attempt + 1}/{self.max_retries + 1})..."
                        )

                    if attempt < self.max_retries:
                        self.sleep_fn(delay)
                        continue
                    else:
                        logger.error(
                            f"✗ Rate limit (429) retries exhausted for {to_email}."
                        )
                        return False

                # 2. Handle Sandbox Domain Fallback in Dev
                if (
                    allow_dev_fallback
                    and ("domain" in error_body.lower() or e.code == 403)
                    and effective_from != FALLBACK_SANDBOX_FROM_EMAIL
                ):
                    logger.warning(
                        f"[DEV ENV] Domain in '{effective_from}' is not yet verified in Resend. Retrying with '{FALLBACK_SANDBOX_FROM_EMAIL}' sandbox domain..."
                    )
                    effective_from = FALLBACK_SANDBOX_FROM_EMAIL
                    payload["from"] = effective_from
                    data = json.dumps(payload).encode("utf-8")
                    continue

                # 3. Handle Transient Server Errors (500, 502, 503, 504)
                if e.code in (500, 502, 503, 504):
                    delay = min(
                        self.max_backoff,
                        self.initial_backoff * (self.backoff_factor**attempt),
                    )
                    logger.warning(
                        f"Transient server error ({e.code}) sending to {to_email}. Retrying in {delay:.2f}s (attempt {attempt + 1}/{self.max_retries + 1})..."
                    )
                    if attempt < self.max_retries:
                        self.sleep_fn(delay)
                        continue

                logger.error(
                    f"✗ Resend API HTTP error sending to {to_email} ({e.code}): {error_body}"
                )
                return False

            except Exception as e:
                delay = min(
                    self.max_backoff,
                    self.initial_backoff * (self.backoff_factor**attempt),
                )
                logger.warning(
                    f"Network error sending to {to_email}: {e}. Retrying in {delay:.2f}s (attempt {attempt + 1}/{self.max_retries + 1})..."
                )
                if attempt < self.max_retries:
                    self.sleep_fn(delay)
                    continue
                logger.error(f"✗ Failed to send email to {to_email}: {e}")
                return False

        return False

    def dispatch_batch(
        self,
        items: list[DispatchItem],
        secondary_pass_delay: float = 2.0,
    ) -> BatchResult:
        """
        Dispatches a batch of emails in a Primary Pass.
        Failed items are collected into a secondary recovery queue and retried before exit.
        Calls item.record_sent_fn(item) for successful deliveries in both passes.
        """
        if not items:
            return BatchResult(
                total_requested=0, primary_sent=0, secondary_sent=0, failed_count=0
            )

        logger.info(f"Starting Primary Dispatch Pass for {len(items)} email(s)...")
        primary_sent = 0
        failed_items: list[DispatchItem] = []

        for item in items:
            sent = self.send_email(
                to_email=item.to_email,
                subject=item.subject,
                html_content=item.html_content,
                text_content=item.text_content,
                from_email=item.from_email or self.default_from_email,
                allow_dev_fallback=item.allow_dev_fallback,
            )
            if sent:
                primary_sent += 1
                if item.record_sent_fn:
                    try:
                        item.record_sent_fn(item)
                    except Exception as err:
                        logger.warning(f"Failed to record delivery log: {err}")
            else:
                failed_items.append(item)

        secondary_sent = 0
        if failed_items:
            logger.warning(
                f"Primary pass completed. {len(failed_items)} delivery failure(s) queued for Secondary Recovery Pass."
            )
            if secondary_pass_delay > 0:
                self.sleep_fn(secondary_pass_delay)

            recovery_queue = list(failed_items)
            failed_items.clear()

            for item in recovery_queue:
                logger.info(
                    f"[SECONDARY PASS] Attempting recovery delivery to {item.to_email}"
                )
                sent = self.send_email(
                    to_email=item.to_email,
                    subject=item.subject,
                    html_content=item.html_content,
                    text_content=item.text_content,
                    from_email=item.from_email or self.default_from_email,
                    allow_dev_fallback=item.allow_dev_fallback,
                )
                if sent:
                    secondary_sent += 1
                    logger.info(
                        f"✓ [SECONDARY PASS] Successfully recovered delivery for {item.to_email}"
                    )
                    if item.record_sent_fn:
                        try:
                            item.record_sent_fn(item)
                        except Exception as err:
                            logger.warning(
                                f"Failed to record recovery delivery log: {err}"
                            )
                else:
                    logger.error(
                        f"✗ [SECONDARY PASS] Recovery pass failed for {item.to_email}"
                    )
                    failed_items.append(item)

        logger.info(
            f"Batch dispatch completed: {primary_sent} primary, {secondary_sent} secondary recovered, {len(failed_items)} permanently failed (total requested: {len(items)})."
        )

        return BatchResult(
            total_requested=len(items),
            primary_sent=primary_sent,
            secondary_sent=secondary_sent,
            failed_count=len(failed_items),
        )
