resource "google_firebaserules_ruleset" "firestore_rules" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../web/firestore.rules")
    }
  }
}

resource "google_firebaserules_release" "firestore_radar_release" {
  provider     = google-beta
  project      = var.project_id
  name         = "cloud.firestore/radar"
  ruleset_name = google_firebaserules_ruleset.firestore_rules.name
}
