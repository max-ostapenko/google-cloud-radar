---
date: 2026-08-25
api: admin.reports_v1
service: Admin SDK Reports
title: "Breaking Changes: Required Parameters and Read-Only Fields"
impact: high
breaking: true
tags: ["breaking-change", "security", "workspace"]
interesting_score: 9
---

# Breaking Changes: Required Parameters and Read-Only Fields

**Date:** 2026-08-25  
**API:** `admin.reports_v1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

The Admin SDK Reports API has updated several key parameters to be strictly required and marked multiple report fields as read-only. Developers must update their implementation to ensure mandatory fields are provided in requests.

## Details

This update introduces significant breaking changes to the Reports API. Several parameters that may have previously been treated as optional are now strictly required, including 'entityType', 'applicationName', 'date', 'userKey', and 'entityKey'. Additionally, multiple properties within the 'UsageReport' and 'ActivityUserDeviceInfo' schemas—such as 'date', 'entity', 'parameters', 'deviceType', and 'deviceId'—are now marked as read-only/immutable, reflecting the historical nature of report data. The API also now supports mTLS via a new root URL (admin.mtls.googleapis.com) and includes updated descriptions for audit and usage readonly OAuth scopes.

**Tags:** `breaking-change` `security` `workspace`
