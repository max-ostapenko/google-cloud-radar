import unittest
from scripts import taxonomy, update_disco


class TestTaxonomy(unittest.TestCase):
    def test_watched_apis(self):
        self.assertTrue(taxonomy.is_watched_api("bigquery"))
        self.assertTrue(taxonomy.is_watched_api("aiplatform"))
        self.assertTrue(taxonomy.is_watched_api("AIPLATFORM"))
        self.assertTrue(taxonomy.is_watched_api("pagespeedonline"))
        self.assertTrue(taxonomy.is_watched_api("gmail"))
        self.assertFalse(taxonomy.is_watched_api("non_existent_fake_api"))

    def test_get_ecosystem_for_service(self):
        self.assertEqual(taxonomy.get_ecosystem_for_service("bigquery"), "Google Cloud")
        self.assertEqual(
            taxonomy.get_ecosystem_for_service("aiplatform"), "Google Cloud"
        )
        self.assertEqual(taxonomy.get_ecosystem_for_service("script"), "Workspace")
        self.assertEqual(
            taxonomy.get_ecosystem_for_service("tagmanager"), "Marketing Platform"
        )
        self.assertEqual(
            taxonomy.get_ecosystem_for_service("photoslibrary"), "Personal"
        )
        self.assertEqual(
            taxonomy.get_ecosystem_for_service("abusiveexperiencereport"), "Chrome"
        )
        self.assertEqual(
            taxonomy.get_ecosystem_for_service("androidpublisher"), "Android"
        )
        self.assertEqual(taxonomy.get_ecosystem_for_service("safebrowsing"), "More")

    def test_get_category_for_service(self):
        self.assertEqual(
            taxonomy.get_category_for_service("bigquery"), "Data Analytics"
        )
        self.assertEqual(taxonomy.get_category_for_service("aiplatform"), "AI & ML")
        self.assertEqual(taxonomy.get_category_for_service("Vertex AI"), "AI & ML")
        self.assertEqual(
            taxonomy.get_category_for_service("cloudbilling"), "FinOps & Billing"
        )
        self.assertEqual(taxonomy.get_category_for_service("tagmanager"), "Tag Manager")

    def test_get_quadrant_for_service(self):
        self.assertEqual(taxonomy.get_quadrant_for_service("aiplatform"), "ai_ml")
        self.assertEqual(
            taxonomy.get_quadrant_for_service("bigquery"), "data_platforms"
        )
        self.assertEqual(
            taxonomy.get_quadrant_for_service("cloudbilling"), "security_finops"
        )

    def test_determine_radar_ring(self):
        # Breaking or deprecated -> hold
        self.assertEqual(
            taxonomy.determine_radar_ring("canary", is_breaking=True, version="v1"),
            "hold",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring(
                "deprecated", is_breaking=False, version="v1"
            ),
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
            taxonomy.determine_radar_ring(
                "canary", is_breaking=False, version="v1beta1"
            ),
            "trial",
        )
        self.assertEqual(
            taxonomy.determine_radar_ring(
                "preview", is_breaking=False, version="v1alpha"
            ),
            "trial",
        )

        # Early canary signal -> assess
        self.assertEqual(
            taxonomy.determine_radar_ring(
                "canary", is_breaking=False, version="v2alpha"
            ),
            "assess",
        )

    def test_watched_api_names_list(self):
        names = taxonomy.get_watched_api_names()
        self.assertIn("bigquery", names)
        self.assertIn("aiplatform", names)
        self.assertEqual(names, sorted(names))

    def test_release_feeds(self):
        self.assertEqual(
            taxonomy.get_release_feed_url("bigquery"),
            "https://cloud.google.com/feeds/bigquery-release-notes.xml",
        )
        self.assertEqual(
            taxonomy.get_release_feed_url("vertex"),
            "https://cloud.google.com/feeds/vertex-ai-release-notes.xml",
        )
        self.assertIsNone(taxonomy.get_release_feed_url("unknown_service"))
        feeds = taxonomy.get_official_release_feeds()
        self.assertIn("bigquery", feeds)
        self.assertIn("dataform", feeds)


if __name__ == "__main__":
    unittest.main()
