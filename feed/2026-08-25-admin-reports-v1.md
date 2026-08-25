---
date: 2026-08-25
api: admin.reports_v1
service: Admin SDK Reports
title: "Breaking Changes and Workspace Studio Support"
impact: high
breaking: false
tags: ["breaking-change", "security", "workspace", "audit-logs"]
interesting_score: 9
---

# Breaking Changes and Workspace Studio Support

**Date:** 2026-08-25  
**API:** `admin.reports_v1`  
**Impact:** High  

## Summary

The Reports API has introduced breaking changes regarding required parameters and read-only fields, while also expanding support for Workspace Studio applications in audit logs.

## Details

This update enforces strict requirements for parameters like 'entityType', 'applicationName', and 'date', while marking several 'UsageReport' fields as read-only. Additionally, the 'includeSensitiveData' parameter in activity listing now supports Workspace Studio applications, allowing sensitive user-generated content in those audit logs. The 'userDeviceInfo' field in Activity schemas is now explicitly scoped to specific applications including Gemini in Workspace, Drive, and Chat, providing better clarity on when device metadata is available. The API also now supports mTLS via a new root URL (admin.mtls.googleapis.com).

**Tags:** `breaking-change` `security` `workspace` `audit-logs`
