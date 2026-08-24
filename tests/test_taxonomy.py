import unittest
from scripts import taxonomy, update_disco


class TestTaxonomy(unittest.TestCase):
    def test_watched_apis(self):
        self.assertTrue(taxonomy.is_watched_api("bigquery"))
        self.assertTrue(taxonomy.is_watched_api("aiplatform"))
        self.assertTrue(taxonomy.is_watched_api("AIPLATFORM"))
        self.assertTrue(taxonomy.is_watched_api("pagespeedonline"))
        self.assertFalse(taxonomy.is_watched_api("non_existent_fake_api"))

    def test_get_category_for_service(self):
        self.assertEqual(taxonomy.get_category_for_service("bigquery"), "Data Platform")
        self.assertEqual(taxonomy.get_category_for_service("aiplatform"), "AI & Machine Learning")
        self.assertEqual(taxonomy.get_category_for_service("Vertex AI"), "AI & Machine Learning")
        self.assertEqual(taxonomy.get_category_for_service("cloudbilling"), "FinOps & Billing")
        self.assertEqual(taxonomy.get_category_for_service("tagmanager"), "Analytics & Web")
        self.assertEqual(taxonomy.get_category_for_service("unknown_xyz"), "Core & Other")

    def test_get_quadrant_for_service(self):
        self.assertEqual(taxonomy.get_quadrant_for_service("aiplatform"), "ai_ml")
        self.assertEqual(taxonomy.get_quadrant_for_service("bigquery"), "data_platforms")
        self.assertEqual(taxonomy.get_quadrant_for_service("cloudbilling"), "security_finops")
        self.assertEqual(taxonomy.get_quadrant_for_service("unknown_api"), "infra_compute")

    def test_determine_radar_ring(self):
        # Breaking or deprecated -> hold
        self.assertEqual(taxonomy.determine_radar_ring("canary", is_breaking=True, version="v1"), "hold")
        self.assertEqual(taxonomy.determine_radar_ring("deprecated", is_breaking=False, version="v1"), "hold")

        # Stable released GA -> adopt
        self.assertEqual(taxonomy.determine_radar_ring("released", is_breaking=False, version="v1"), "adopt")
        self.assertEqual(taxonomy.determine_radar_ring("ga", is_breaking=False, version="v1"), "adopt")
        self.assertEqual(taxonomy.determine_radar_ring("canary", is_breaking=False, version="v1"), "adopt")

        # Beta / preview -> trial
        self.assertEqual(taxonomy.determine_radar_ring("canary", is_breaking=False, version="v1beta1"), "trial")
        self.assertEqual(taxonomy.determine_radar_ring("preview", is_breaking=False, version="v1alpha"), "trial")

        # Early canary signal -> assess
        self.assertEqual(taxonomy.determine_radar_ring("canary", is_breaking=False, version="v2alpha"), "assess")

    def test_watched_api_names_list(self):
        names = taxonomy.get_watched_api_names()
        self.assertIn("bigquery", names)
        self.assertIn("aiplatform", names)
        self.assertEqual(names, sorted(names))


if __name__ == "__main__":
    unittest.main()
