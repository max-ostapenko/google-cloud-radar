import unittest

from scripts.diff_to_feed import (
    extract_method_and_path_metadata,
    is_duplicate_diff,
)


class TestDiffToFeedDeduplication(unittest.TestCase):
    def test_extract_method_and_path_metadata(self):
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get"],
            "target_paths": ["schemas.Job.properties.status.type"],
        }
        methods, paths = extract_method_and_path_metadata(diff)
        self.assertEqual({"jobs.get"}, methods)
        self.assertEqual({"schemas.job.properties.status.type"}, paths)

    def test_extract_method_and_path_metadata_fallback(self):
        diff = {
            "api": "bigquery.v2",
            "added": [
                {
                    "path": "resources.jobs.methods.get.parameters.newParam.type",
                    "value": "string",
                },
                {"path": "schemas.Job.properties.version.type", "value": "string"},
            ],
            "modified": [
                {
                    "path": "schemas.Job.properties.status.type",
                    "old": "string",
                    "new": "integer",
                }
            ],
        }
        methods, paths = extract_method_and_path_metadata(diff)
        self.assertEqual({"jobs.get"}, methods)
        self.assertEqual(
            {
                "resources.jobs.methods.get.parameters.newparam.type",
                "schemas.job.properties.version.type",
                "schemas.job.properties.status.type",
            },
            paths,
        )

    def test_is_duplicate_diff_exact_duplicate_suppressed(self):
        history = [
            {
                "slug": "2026-08-01-bigquery-v2",
                "date": "2026-08-01",
                "extracted_methods": ["jobs.get"],
                "target_paths": ["schemas.job.properties.status.type"],
                "content": "Summary: BigQuery updated status field. Details: None",
            }
        ]
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get"],
            "target_paths": ["schemas.job.properties.status.type"],
        }
        is_dup, reason = is_duplicate_diff(diff, history)
        self.assertTrue(is_dup)
        self.assertIn("Identical method set", reason)

    def test_is_duplicate_diff_distinct_common_property_name_published(self):
        # Historical item modified 'status', but text summary mentions 'status' and 'version'
        history = [
            {
                "slug": "2026-08-01-bigquery-v2",
                "date": "2026-08-01",
                "extracted_methods": ["jobs.get"],
                "target_paths": ["schemas.job.properties.status.type"],
                "content": "Summary: BigQuery status and version updates. Details: None",
            }
        ]
        # Incoming diff modifies 'version' field instead of 'status'
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get"],
            "target_paths": ["schemas.job.properties.version.type"],
        }
        is_dup, reason = is_duplicate_diff(diff, history)
        self.assertFalse(is_dup)
        self.assertEqual("", reason)

    def test_is_duplicate_diff_partial_overlap_methods_published(self):
        history = [
            {
                "slug": "2026-08-01-bigquery-v2",
                "date": "2026-08-01",
                "extracted_methods": ["jobs.get"],
                "target_paths": ["schemas.job.properties.status.type"],
            }
        ]
        # Incoming diff includes an additional method 'jobs.list'
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get", "jobs.list"],
            "target_paths": ["schemas.job.properties.status.type"],
        }
        is_dup, reason = is_duplicate_diff(diff, history)
        self.assertFalse(is_dup)

    def test_is_duplicate_diff_partial_overlap_paths_published(self):
        history = [
            {
                "slug": "2026-08-01-bigquery-v2",
                "date": "2026-08-01",
                "extracted_methods": ["jobs.get"],
                "target_paths": ["schemas.job.properties.status.type"],
            }
        ]
        # Incoming diff includes an additional target path 'schemas.job.properties.version.type'
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get"],
            "target_paths": [
                "schemas.job.properties.status.type",
                "schemas.job.properties.version.type",
            ],
        }
        is_dup, reason = is_duplicate_diff(diff, history)
        self.assertFalse(is_dup)

    def test_is_duplicate_diff_backward_compatibility_with_legacy_history(self):
        # Legacy history item with no extracted_methods or target_paths
        history = [
            {
                "slug": "2026-05-01-bigquery-v2",
                "date": "2026-05-01",
                "content": "Summary: BigQuery jobs.get updated status field.",
            }
        ]
        diff = {
            "api": "bigquery.v2",
            "extracted_methods": ["jobs.get"],
            "target_paths": ["schemas.job.properties.status.type"],
        }
        is_dup, reason = is_duplicate_diff(diff, history)
        self.assertFalse(is_dup)


if __name__ == "__main__":
    unittest.main()
