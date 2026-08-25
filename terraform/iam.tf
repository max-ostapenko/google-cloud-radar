variable "ci_service_account" {
  type        = string
  description = "The service account in max-ostapenko used by GitHub Actions CI/CD."
  default     = "discovery-artifact-manager@max-ostapenko.iam.gserviceaccount.com"
}

locals {
  ci_roles = [
    "roles/firebasehosting.admin",           # Deploy web app to Firebase Hosting
    "roles/firebaserules.admin",             # Deploy and update Firestore security rules
    "roles/datastore.user",                  # Sync feed entries and metadata to Firestore database
    "roles/aiplatform.user",                 # Invoke Vertex AI Gemini models for diff analysis
    "roles/serviceusage.serviceUsageConsumer" # Consume enabled GCP APIs in this project
  ]
}

resource "google_project_iam_member" "ci_roles" {
  for_each = toset(local.ci_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${var.ci_service_account}"
}
