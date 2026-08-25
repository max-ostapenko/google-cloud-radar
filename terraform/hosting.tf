resource "google_firebase_hosting_site" "radar" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id
}

resource "google_firebase_hosting_custom_domain" "apex" {
  provider      = google-beta
  project       = var.project_id
  site_id       = google_firebase_hosting_site.radar.site_id
  custom_domain = "google-cloud-radar.com"
}

resource "google_firebase_hosting_custom_domain" "www" {
  provider        = google-beta
  project         = var.project_id
  site_id         = google_firebase_hosting_site.radar.site_id
  custom_domain   = "www.google-cloud-radar.com"
  redirect_target = "google-cloud-radar.com"
}
