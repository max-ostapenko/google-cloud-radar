---
date: 2026-08-25
api: libraryagent.v1
service: Library Agent
title: "Breaking: Library Agent enforces required parameters"
impact: high
breaking: true
tags: ["breaking-change", "library-agent", "api-update"]
interesting_score: 8
status: released
lead_time_days: 0
official_release_date: "2025-09-10"
official_release_notes_url: "https://docs.cloud.google.com/vertex-ai/docs/release-notes#September_10_2025"
---


# Breaking: Library Agent enforces required parameters

**Date:** 2026-08-25  
**API:** `libraryagent.v1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

The Library Agent API has updated its schema to enforce 'name' and 'parent' as strictly required parameters while adding standard GCP global parameters.

## Details

This update introduces breaking changes by marking the 'name' and 'parent' parameters as strictly required across the API surface. Developers must ensure these fields are included in their requests to avoid validation errors. Additionally, the 'shelves.get' method has been formally added, and the API now supports standard Google Cloud global query parameters such as 'fields', 'prettyPrint', and 'quotaUser'. The update also includes mTLS support via a new root URL: https://libraryagent.mtls.googleapis.com/.

**Tags:** `breaking-change` `library-agent` `api-update`
