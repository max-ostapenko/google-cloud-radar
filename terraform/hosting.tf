resource "google_firebase_hosting_site" "radar" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id
}
