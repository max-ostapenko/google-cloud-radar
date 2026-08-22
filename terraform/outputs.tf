output "hosting_site_id" {
  description = "The Firebase Hosting Site ID"
  value       = google_firebase_hosting_site.radar.site_id
}

output "hosting_default_url" {
  description = "Default URL for the Firebase Hosting site"
  value       = google_firebase_hosting_site.radar.default_url
}

output "firestore_database_name" {
  description = "The default Firestore database resource"
  value       = "projects/${var.project_id}/databases/(default)"
}
