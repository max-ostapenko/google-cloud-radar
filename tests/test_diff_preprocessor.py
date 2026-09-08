import json
import unittest

from scripts import diff_preprocessor


class TestDiffPreprocessor(unittest.TestCase):
    def test_build_structured_diff_ignores_noise_only_changes(self):
        old = {
            "revision": "1",
            "etag": "old",
            "resources": {
                "jobs": {
                    "methods": {
                        "get": {
                            "description": "Get a job.",
                            "httpMethod": "GET",
                        }
                    }
                }
            },
        }
        new = {
            "revision": "2",
            "etag": "new",
            "resources": {
                "jobs": {
                    "methods": {
                        "get": {
                            "description": "Get a job.",
                            "httpMethod": "GET",
                        }
                    }
                }
            },
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNone(result)

    def test_build_structured_diff_groups_added_removed_and_modified_paths(self):
        old = {
            "revision": "1",
            "resources": {
                "jobs": {
                    "methods": {
                        "get": {
                            "httpMethod": "GET",
                            "parameters": {
                                "jobId": {"type": "string"},
                                "oldFlag": {"type": "boolean"},
                            },
                        }
                    }
                }
            },
        }
        new = {
            "revision": "2",
            "resources": {
                "jobs": {
                    "methods": {
                        "get": {
                            "httpMethod": "POST",
                            "parameters": {
                                "jobId": {"type": "string"},
                                "newFlag": {"type": "boolean"},
                            },
                        }
                    }
                }
            },
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertEqual("bigquery.v2", result["api"])
        self.assertEqual(
            [
                {
                    "path": ("resources.jobs.methods.get.parameters.newFlag.type"),
                    "value": "boolean",
                }
            ],
            result["added"],
        )
        self.assertEqual(
            [
                {
                    "path": ("resources.jobs.methods.get.parameters.oldFlag.type"),
                    "old_value": "boolean",
                }
            ],
            result["removed"],
        )
        self.assertEqual(
            [
                {
                    "path": "resources.jobs.methods.get.httpMethod",
                    "old": "GET",
                    "new": "POST",
                }
            ],
            result["modified"],
        )
        self.assertEqual(1, result["_stats"]["added_count"])
        self.assertEqual(1, result["_stats"]["removed_count"])
        self.assertEqual(1, result["_stats"]["modified_count"])
        self.assertEqual(0, result["_stats"]["description_only_modified"])
        self.assertTrue(result["_stats"]["is_breaking"])
        self.assertTrue(result["is_breaking"])

    def test_build_structured_diff_ignores_whole_document_deletion_or_sweeps(self):
        # Full file deletion (new is empty string or empty dict)
        old = {
            "name": "libraryagent",
            "version": "v1",
            "resources": {
                f"res_{i}": {"methods": {"get": {"httpMethod": "GET"}}}
                for i in range(50)
            },
        }
        res_deleted = diff_preprocessor.build_structured_diff(
            "libraryagent.v1.json", json.dumps(old), ""
        )
        self.assertIsNone(res_deleted)

        # Gutted/swept document (only 1-2 keys left, dozens removed)
        new_gutted = {"name": "libraryagent"}
        res_gutted = diff_preprocessor.build_structured_diff(
            "libraryagent.v1.json", json.dumps(old), json.dumps(new_gutted)
        )
        self.assertIsNone(res_gutted)

    def test_detect_breaking_changes_identifies_removed_properties_and_methods(self):
        old = {
            "resources": {
                "datasets": {
                    "methods": {
                        "delete": {
                            "httpMethod": "DELETE",
                            "parameters": {
                                "datasetId": {"type": "string"},
                                "deleteContents": {
                                    "type": "boolean",
                                    "required": False,
                                },
                            },
                        },
                        "legacyMethod": {
                            "httpMethod": "POST",
                        },
                    }
                }
            },
            "schemas": {
                "Dataset": {
                    "properties": {
                        "id": {"type": "string"},
                        "removedField": {"type": "string"},
                        "typeMutatedField": {"type": "array"},
                    }
                }
            },
        }

        new = {
            "resources": {
                "datasets": {
                    "methods": {
                        "delete": {
                            "httpMethod": "DELETE",
                            "parameters": {
                                "datasetId": {"type": "string", "required": True},
                            },
                        },
                        "newMethod": {
                            "httpMethod": "GET",
                        },
                    }
                }
            },
            "schemas": {
                "Dataset": {
                    "properties": {
                        "id": {"type": "string"},
                        "typeMutatedField": {"type": "object"},
                        "newField": {"type": "string"},
                    }
                }
            },
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["is_breaking"])
        reasons = result["breaking_reasons"]

        self.assertTrue(any("Removed API method 'legacyMethod'" in r for r in reasons))
        self.assertTrue(any("Removed parameter 'deleteContents'" in r for r in reasons))
        self.assertTrue(any("Removed property 'removedField'" in r for r in reasons))
        self.assertTrue(
            any("changed type from 'array' to 'object'" in r for r in reasons)
        )
        self.assertTrue(any("was changed to strictly required" in r for r in reasons))

    def test_detect_breaking_changes_false_for_pure_additions(self):
        old = {
            "resources": {
                "jobs": {
                    "methods": {
                        "query": {
                            "httpMethod": "POST",
                            "parameters": {
                                "projectId": {"type": "string"},
                            },
                        }
                    }
                }
            },
            "schemas": {
                "Job": {
                    "properties": {
                        "id": {"type": "string"},
                    }
                }
            },
        }

        new = {
            "resources": {
                "jobs": {
                    "methods": {
                        "query": {
                            "httpMethod": "POST",
                            "parameters": {
                                "projectId": {"type": "string"},
                                "newOptionalParam": {
                                    "type": "boolean",
                                    "required": False,
                                },
                            },
                        },
                        "newExtraMethod": {
                            "httpMethod": "GET",
                        },
                    }
                }
            },
            "schemas": {
                "Job": {
                    "properties": {
                        "id": {"type": "string"},
                        "newResponseField": {"type": "string"},
                    }
                }
            },
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertFalse(result["is_breaking"])
        self.assertEqual([], result["breaking_reasons"])

    def test_parameter_enum_removal_flags_breaking_change(self):
        old = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "projection": {
                                    "type": "string",
                                    "enum": ["full", "minimal"],
                                }
                            },
                        }
                    }
                }
            }
        }
        new = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "projection": {
                                    "type": "string",
                                    "enum": ["full"],
                                }
                            },
                        }
                    }
                }
            }
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["is_breaking"])
        self.assertTrue(result["_stats"]["is_breaking"])
        expected_reason = "Removed enum value 'minimal' from parameter 'projection'"
        self.assertIn(expected_reason, result["breaking_reasons"])
        self.assertIn(expected_reason, result["_stats"]["breaking_reasons"])

    def test_parameter_enum_addition_is_non_breaking(self):
        old = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "projection": {
                                    "type": "string",
                                    "enum": ["full"],
                                }
                            },
                        }
                    }
                }
            }
        }
        new = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "projection": {
                                    "type": "string",
                                    "enum": ["full", "minimal"],
                                }
                            },
                        }
                    }
                }
            }
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertFalse(result["is_breaking"])
        self.assertEqual([], result["breaking_reasons"])

    def test_parameter_default_modification_flags_breaking_change(self):
        old = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "maxResults": {
                                    "type": "integer",
                                    "default": "100",
                                }
                            },
                        }
                    }
                }
            }
        }
        new = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "maxResults": {
                                    "type": "integer",
                                    "default": "50",
                                }
                            },
                        }
                    }
                }
            }
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["is_breaking"])
        expected_reason = (
            "Default value for parameter 'maxResults' changed from '100' to '50'"
        )
        self.assertIn(expected_reason, result["breaking_reasons"])

    def test_parameter_default_removal_flags_breaking_change(self):
        old = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "maxResults": {
                                    "type": "integer",
                                    "default": "100",
                                }
                            },
                        }
                    }
                }
            }
        }
        new = {
            "resources": {
                "jobs": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "parameters": {
                                "maxResults": {
                                    "type": "integer",
                                }
                            },
                        }
                    }
                }
            }
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        self.assertIsNotNone(result)
        self.assertTrue(result["is_breaking"])
        expected_reason = "Default value for parameter 'maxResults' was removed"
        self.assertIn(expected_reason, result["breaking_reasons"])

    def test_schema_property_enum_or_default_change_does_not_trigger_parameter_breaking(
        self,
    ):
        old = {
            "schemas": {
                "JobConfig": {
                    "properties": {
                        "state": {
                            "type": "string",
                            "enum": ["PENDING", "RUNNING"],
                            "default": "PENDING",
                        }
                    }
                }
            }
        }
        new = {
            "schemas": {
                "JobConfig": {
                    "properties": {
                        "state": {
                            "type": "string",
                            "enum": ["PENDING"],
                            "default": "RUNNING",
                        }
                    }
                }
            }
        }

        result = diff_preprocessor.build_structured_diff(
            "bigquery.v2.json", json.dumps(old), json.dumps(new)
        )

        # Schema property default/enum changes are excluded from method parameter breaking rules
        if result is not None:
            self.assertNotIn(
                "Removed enum value 'RUNNING' from parameter 'state'",
                result["breaking_reasons"],
            )
            self.assertFalse(
                any("parameter 'state'" in r for r in result["breaking_reasons"])
            )


if __name__ == "__main__":
    unittest.main()
