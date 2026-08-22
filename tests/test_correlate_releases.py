import os
import tempfile
import pytest
from scripts import correlate_releases


def test_calculate_lead_time():
    lead = correlate_releases.calculate_lead_time("2026-08-01", "2026-08-15")
    assert lead == 14

    lead_same = correlate_releases.calculate_lead_time("2026-08-15", "2026-08-15")
    assert lead_same == 0

    lead_neg = correlate_releases.calculate_lead_time("2026-08-20", "2026-08-15")
    assert lead_neg == 0


def test_parse_feed_xml_atom():
    sample_atom = """<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Vertex AI Release Notes</title>
      <entry>
        <title>Reasoning Engine session compaction is now GA</title>
        <link href="https://cloud.google.com/vertex-ai/docs/release-notes#August_15_2026"/>
        <updated>2026-08-15T12:00:00Z</updated>
        <content type="html">You can now use session compact method to summarize reasoning engines.</content>
      </entry>
    </feed>
    """
    entries = correlate_releases.parse_feed_xml(sample_atom)
    assert len(entries) == 1
    assert entries[0]["title"] == "Reasoning Engine session compaction is now GA"
    assert entries[0]["date"] == "2026-08-15"
    assert "compact" in entries[0]["text"]


def test_match_change_against_releases_by_rpc():
    change_meta = {
        "slug": "2026-08-01-aiplatform-v1beta1",
        "title": "Vertex AI: Session Compaction and Transcription",
        "first_detected": "2026-08-01",
        "extracted_methods": ["projects.locations.reasoningEngines.sessions.compact"]
    }
    release_entries = [
        {
            "title": "Unrelated BigQuery update",
            "url": "https://cloud.google.com/release-notes/1",
            "date": "2026-08-10",
            "text": "bigquery adds new streaming options"
        },
        {
            "title": "Vertex AI adds session compact",
            "url": "https://cloud.google.com/release-notes/2",
            "date": "2026-08-15",
            "text": "developers can now compact sessions in reasoning engines"
        }
    ]

    match = correlate_releases.match_change_against_releases(change_meta, release_entries)
    assert match is not None
    assert match["date"] == "2026-08-15"
    assert match["url"] == "https://cloud.google.com/release-notes/2"


def test_update_markdown_frontmatter():
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".md") as tmp:
        tmp.write("""---
service: "Vertex AI"
api: "aiplatform.v1beta1"
title: "Session Compaction"
---

## Summary
Details here.
""")
        tmp_path = tmp.name

    try:
        rel_info = {"date": "2026-08-20", "url": "https://cloud.google.com/release-notes#1"}
        ok = correlate_releases.update_markdown_frontmatter(tmp_path, rel_info, lead_time_days=19)
        assert ok is True

        with open(tmp_path, "r") as f:
            updated = f.read()

        assert "status: released" in updated
        assert "lead_time_days: 19" in updated
        assert 'official_release_date: "2026-08-20"' in updated
        assert 'official_release_notes_url: "https://cloud.google.com/release-notes#1"' in updated
    finally:
        os.unlink(tmp_path)
