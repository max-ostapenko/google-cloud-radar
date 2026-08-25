resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  authorized_domains = [
    "localhost",
    "127.0.0.1",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
    "google-cloud-radar.com",
    "www.google-cloud-radar.com"
  ]
}
