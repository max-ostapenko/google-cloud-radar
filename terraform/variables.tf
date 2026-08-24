variable "project_id" {
  type        = string
  description = "The Google Cloud project ID."
  default     = "gcp-cloud-radar"
}

variable "region" {
  type        = string
  description = "The default GCP region for resources."
  default     = "us-central1"
}

variable "site_id" {
  type        = string
  description = "The Firebase Hosting site ID for the discovery radar."
  default     = "gcp-cloud-radar"
}
