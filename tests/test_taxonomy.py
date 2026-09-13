import json
import re
import unittest
from pathlib import Path
from scripts import taxonomy


REPO_ROOT = Path(__file__).resolve().parent.parent
TAXONOMY_PATH = REPO_ROOT / "data" / "taxonomy.json"
DISCOVERY_INDEX_PATH = REPO_ROOT / "discoveries" / "index.json"


class TestTaxonomy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
            cls.taxonomy_data = json.load(f)

        with open(DISCOVERY_INDEX_PATH, "r", encoding="utf-8") as f:
            cls.discovery_data = json.load(f)

        cls.ecosystems_raw = cls.taxonomy_data.get("ecosystems", [])
        cls.categories_raw = cls.taxonomy_data.get("categories", [])
        cls.services_raw = cls.taxonomy_data.get("services", {})
        cls.watched_services = taxonomy.WATCHED_SERVICES
        cls.ecosystems = taxonomy.ECOSYSTEMS
        cls.categories = taxonomy.CATEGORIES
        cls.valid_quadrants = {"ai_ml", "data_platforms", "infra_compute", "security_finops"}

        # Index discovery items by API name (e.g. 'aiplatform', 'discoveryengine', 'bigquery')
        cls.discovery_by_name: dict[str, list[dict]] = {}
        for item in cls.discovery_data.get("items", []):
            name = item.get("name")
            if name:
                cls.discovery_by_name.setdefault(name, []).append(item)

    def test_hierarchical_schema_integrity(self):
        """Verify the 3-level hierarchical structure and reference integrity."""
        # 1. Ecosystems list with categories ID list
        self.assertIsInstance(self.ecosystems_raw, list, "ecosystems should be a list")
        self.assertGreater(len(self.ecosystems_raw), 0)
        eco_ids = set()
        referenced_cat_ids = set()

        for eco in self.ecosystems_raw:
            self.assertIn("id", eco)
            self.assertIn("name", eco)
            self.assertIn("categories", eco)
            self.assertIsInstance(eco["categories"], list)
            self.assertGreater(len(eco["categories"]), 0, f"Ecosystem {eco['id']} has no categories")
            self.assertNotIn(eco["id"], eco_ids, f"Duplicate ecosystem id: {eco['id']}")
            eco_ids.add(eco["id"])
            for cat_id in eco["categories"]:
                self.assertNotIn(cat_id, referenced_cat_ids, f"Category {cat_id} assigned to multiple ecosystems")
                referenced_cat_ids.add(cat_id)

        # 2. Categories list with services ID list
        self.assertIsInstance(self.categories_raw, list, "categories should be a list")
        self.assertGreater(len(self.categories_raw), 0)
        cat_ids = set()
        referenced_service_ids = set()

        for cat in self.categories_raw:
            self.assertIn("id", cat)
            self.assertIn("name", cat)
            self.assertIn("services", cat)
            self.assertIsInstance(cat["services"], list)
            self.assertNotIn(cat["id"], cat_ids, f"Duplicate category id: {cat['id']}")
            cat_ids.add(cat["id"])

            # Every category must be referenced in an ecosystem
            self.assertIn(cat["id"], referenced_cat_ids, f"Category {cat['id']} not in any ecosystem")

            for svc_id in cat["services"]:
                self.assertNotIn(svc_id, referenced_service_ids, f"Service {svc_id} assigned to multiple categories")
                referenced_service_ids.add(svc_id)

        # 3. Services dictionary
        self.assertIsInstance(self.services_raw, dict, "services should be a dictionary")
        self.assertGreater(len(self.services_raw), 0)

        # Every service in services dict must be referenced in exactly one category
        for svc_id in self.services_raw:
            self.assertIn(svc_id, referenced_service_ids, f"Service {svc_id} not referenced in any category")

        # Every service referenced in a category must exist in services dict
        for svc_id in referenced_service_ids:
            self.assertIn(svc_id, self.services_raw, f"Referenced service {svc_id} missing from services dict")

    def test_all_watched_services_exist_in_discovery_index(self):
        """Verify that every watched service in taxonomy.json matches a valid API in discoveries/index.json."""
        self.assertGreater(len(self.watched_services), 0, "watched_services should not be empty")

        for api_name in self.services_raw:
            with self.subTest(api=api_name):
                # 1. Verify existence in discoveries/index.json
                self.assertIn(
                    api_name,
                    self.discovery_by_name,
                    f"Watched service '{api_name}' does not match any API name in discoveries/index.json",
                )

                # 2. Verify taxonomy API recognition
                self.assertTrue(
                    taxonomy.is_watched_api(api_name),
                    f"is_watched_api failed for exact key '{api_name}'",
                )
                self.assertTrue(
                    taxonomy.is_watched_api(api_name.upper()),
                    f"is_watched_api failed for uppercase '{api_name.upper()}'",
                )
                self.assertTrue(
                    taxonomy.is_watched_api(f"{api_name}.v1"),
                    f"is_watched_api failed for dot-versioned '{api_name}.v1'",
                )
                self.assertTrue(
                    taxonomy.is_watched_api(f"{api_name}:v1"),
                    f"is_watched_api failed for discovery id format '{api_name}:v1'",
                )

        # Non-existent API check
        self.assertFalse(taxonomy.is_watched_api("non_existent_fake_api"))

    def test_watched_services_fields_match_discovery_metadata(self):
        """Verify all fields of watched services and validate against discovery directory items."""
        for api_name, meta in self.watched_services.items():
            with self.subTest(api=api_name):
                discovery_items = self.discovery_by_name.get(api_name, [])
                self.assertGreater(
                    len(discovery_items), 0, f"No discovery items for '{api_name}'"
                )

                # Verify discovery directory item fields
                for disco_item in discovery_items:
                    self.assertEqual(disco_item.get("name"), api_name)
                    self.assertTrue(
                        disco_item.get("version"),
                        f"Discovery item version missing for {api_name}",
                    )
                    self.assertTrue(
                        disco_item.get("title"),
                        f"Discovery item title missing for {api_name}",
                    )
                    rest_url = disco_item.get("discoveryRestUrl", "")
                    self.assertTrue(
                        rest_url.startswith("https://"),
                        f"discoveryRestUrl should be HTTPS for {api_name}",
                    )

                # Verify resolved taxonomy metadata structure
                self.assertTrue(
                    meta.get("name"), f"Missing canonical 'name' for '{api_name}'"
                )
                self.assertIn(
                    meta.get("ecosystem"),
                    self.ecosystems,
                    f"Invalid ecosystem '{meta.get('ecosystem')}' for '{api_name}'",
                )
                self.assertIn(
                    meta.get("category"),
                    self.categories,
                    f"Invalid category '{meta.get('category')}' for '{api_name}'",
                )

                # Verify feed URLs if present
                for url in taxonomy.get_release_feed_urls(api_name):
                    self.assertTrue(
                        url.startswith("http://") or url.startswith("https://"),
                        f"Malformed release feed URL for '{api_name}': {url}",
                    )

                # Verify aliases if present
                for alias in meta.get("aliases", []):
                    resolved = taxonomy._find_service_meta(alias)
                    self.assertIsNotNone(
                        resolved, f"Alias '{alias}' for '{api_name}' could not be resolved"
                    )
                    self.assertEqual(
                        resolved.get("name"),
                        meta.get("name"),
                        f"Alias '{alias}' resolved to '{resolved.get('name')}' instead of '{meta.get('name')}'",
                    )

    def test_canonical_ai_services_grouping(self):
        """Verify that AI APIs (aiplatform and discoveryengine) group into exactly 2 services."""
        ai_services = {
            api: meta
            for api, meta in self.watched_services.items()
            if meta.get("ecosystem") == "AI/ML"
        }

        # Should be exactly 2 services under AI/ML
        canonical_names = {meta.get("name") for meta in ai_services.values()}
        self.assertEqual(
            canonical_names,
            {"Vertex AI", "Vertex AI Agent Builder"},
            f"Expected exactly 2 canonical AI services, got: {canonical_names}",
        )

        # 1. aiplatform variations and renames must resolve to Vertex AI
        aiplatform_queries = [
            "aiplatform",
            "aiplatform.v1",
            "aiplatform.v1beta1",
            "aiplatform:v1",
            "Vertex AI",
            "Agent Platform API",
            "Gemini Enterprise Agent Platform",
        ]
        for q in aiplatform_queries:
            with self.subTest(query=q):
                meta = taxonomy._find_service_meta(q)
                self.assertIsNotNone(meta, f"Failed to resolve {q}")
                self.assertEqual(meta.get("name"), "Vertex AI")
                self.assertEqual(meta.get("ecosystem"), "AI/ML")
                self.assertEqual(meta.get("category"), "Generative AI")
                self.assertEqual(taxonomy.get_ecosystem_for_service(q), "AI/ML")
                self.assertEqual(taxonomy.get_category_for_service(q), "Generative AI")
                self.assertEqual(taxonomy.get_quadrant_for_service(q), "ai_ml")

        # 2. discoveryengine variations and renames must resolve to Vertex AI Agent Builder
        discoveryengine_queries = [
            "discoveryengine",
            "discoveryengine.v1",
            "discoveryengine.v1alpha",
            "discoveryengine.v1beta",
            "discoveryengine:v1",
            "Vertex AI Agent Builder",
            "Discovery Engine API",
            "Vertex AI Search and Conversation",
            "Generative AI App Builder",
        ]
        for q in discoveryengine_queries:
            with self.subTest(query=q):
                meta = taxonomy._find_service_meta(q)
                self.assertIsNotNone(meta, f"Failed to resolve {q}")
                self.assertEqual(meta.get("name"), "Vertex AI Agent Builder")
                self.assertEqual(meta.get("ecosystem"), "AI/ML")
                self.assertEqual(meta.get("category"), "Generative AI")
                self.assertEqual(taxonomy.get_ecosystem_for_service(q), "AI/ML")
                self.assertEqual(taxonomy.get_category_for_service(q), "Generative AI")
                self.assertEqual(taxonomy.get_quadrant_for_service(q), "ai_ml")

    def test_dynamic_ecosystem_and_category_resolution(self):
        """Dynamically test that all watched services resolve to their taxonomy definitions."""
        for api_name, meta in self.watched_services.items():
            expected_eco = meta.get("ecosystem")
            expected_cat = meta.get("category")
            expected_quad = meta.get("quadrant")
            canonical_name = meta.get("name")

            # Resolve by API key
            self.assertEqual(taxonomy.get_ecosystem_for_service(api_name), expected_eco)
            self.assertEqual(taxonomy.get_category_for_service(api_name), expected_cat)
            self.assertIn(taxonomy.get_quadrant_for_service(api_name), self.valid_quadrants)

            # Resolve by versioned API
            self.assertEqual(taxonomy.get_ecosystem_for_service(f"{api_name}.v1"), expected_eco)
            self.assertEqual(taxonomy.get_category_for_service(f"{api_name}.v1"), expected_cat)

            # Resolve by canonical display name
            self.assertEqual(taxonomy.get_ecosystem_for_service(canonical_name), expected_eco)
            self.assertEqual(taxonomy.get_category_for_service(canonical_name), expected_cat)

        # Fallback for unknown service
        self.assertEqual(taxonomy.get_ecosystem_for_service("unknown_service_xyz"), "More")
        self.assertEqual(taxonomy.get_category_for_service("unknown_service_xyz"), "Data Analytics")

    def test_determine_radar_ring(self):
        """Test Thoughtworks Tech Radar ring classification logic."""
        # Breaking or deprecated -> hold
        self.assertEqual(
            taxonomy.determine_radar_ring("canary", is_breaking=True, version="v1"),
            "hold",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring("deprecated", is_breaking=False, version="v1"),
            "hold",
        )

        # Stable released GA -> adopt
        self.assertEqual(
            taxonomy.determine_radar_ring("released", is_breaking=False, version="v1"),
            "adopt",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring("ga", is_breaking=False, version="v1"),
            "adopt",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring("canary", is_breaking=False, version="v1"),
            "adopt",
        )

        # Beta / preview -> trial
        self.assertEqual(
            taxonomy.determine_radar_ring("canary", is_breaking=False, version="v1beta1"),
            "trial",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring("preview", is_breaking=False, version="v1alpha"),
            "trial",
        )

        # Early canary signal -> assess
        self.assertEqual(
            taxonomy.determine_radar_ring("canary", is_breaking=False, version="v2alpha"),
            "assess",
        )

    def test_watched_api_names_list(self):
        """Verify get_watched_api_names returns a sorted list of all watched service keys."""
        names = taxonomy.get_watched_api_names()
        self.assertEqual(names, sorted(self.services_raw.keys()))
        self.assertIn("bigquery", names)
        self.assertIn("aiplatform", names)
        self.assertIn("discoveryengine", names)

    def test_release_feeds(self):
        """Verify release feeds return valid URLs and map to watched services."""
        self.assertEqual(
            taxonomy.get_release_feed_url("bigquery"),
            "https://cloud.google.com/feeds/bigquery-release-notes.xml",
        )
        self.assertEqual(
            taxonomy.get_release_feed_url("aiplatform"),
            "https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml",
        )
        self.assertEqual(
            taxonomy.get_release_feed_url("discoveryengine"),
            "https://docs.cloud.google.com/feeds/gemini-enterprise-agent-platform-release-notes.xml",
        )

        self.assertIsNone(taxonomy.get_release_feed_url("unknown_service"))
        self.assertEqual(taxonomy.get_release_feed_urls("unknown_service"), [])

        feeds = taxonomy.get_official_release_feeds()
        for service_key, feed_url in feeds.items():
            self.assertIn(service_key, self.watched_services)
            self.assertTrue(
                feed_url.startswith("http://") or feed_url.startswith("https://"),
                f"Invalid feed URL for {service_key}: {feed_url}",
            )


if __name__ == "__main__":
    unittest.main()
