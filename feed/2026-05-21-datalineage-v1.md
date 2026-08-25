---
date: 2026-05-21
api: datalineage.v1
service: Data Lineage
title: "Granular OAuth Scopes for Data Lineage Streaming"
impact: low
breaking: false
tags: ["security", "iam", "datalineage"]
interesting_score: 4
status: released
lead_time_days: 57
official_release_date: "2026-07-17"
official_release_notes_url: "https://docs.cloud.google.com/dataplex/docs/release-notes#July_17_2026"
---


# Granular OAuth Scopes for Data Lineage Streaming

**Date:** 2026-05-21  
**API:** `datalineage.v1`  
**Impact:** Low  

## Summary

The Data Lineage API now supports specific read-only and read-write OAuth scopes for the searchLineageStreaming method, enabling better security posture.

## Details

The searchLineageStreaming method under projects.locations has been updated to explicitly support the https://www.googleapis.com/auth/datalineage.read-write and https://www.googleapis.com/auth/datalineage.readonly scopes. This allows developers to follow the principle of least privilege by using lineage-specific scopes rather than broader cloud-platform permissions.

**Tags:** `security` `iam` `datalineage`
