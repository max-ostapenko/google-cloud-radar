output "hosting_site_id" {
  description = "The Firebase Hosting Site ID"
  value       = google_firebase_hosting_site.radar.site_id
}

output "hosting_default_url" {
  description = "Default URL for the Firebase Hosting site"
  value       = google_firebase_hosting_site.radar.default_url
}

output "firestore_database_name" {
  description = "The Firestore database resource"
  value       = "projects/${var.project_id}/databases/radar"
}

output "custom_domain_dns_updates" {
  description = "Required DNS updates for custom domain verification and routing"
  value       = google_firebase_hosting_custom_domain.apex.required_dns_updates
}
