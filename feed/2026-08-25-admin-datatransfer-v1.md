---
date: 2026-08-25
api: admin.datatransfer_v1
service: Admin SDK Data Transfer
title: "Breaking changes and parameter enforcement in Data Transfer"
impact: high
breaking: true
tags: ["breaking-change", "admin-sdk", "security"]
interesting_score: 8
---

# Breaking changes and parameter enforcement in Data Transfer

**Date:** 2026-08-25  
**API:** `admin.datatransfer_v1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

The Data Transfer API now strictly enforces required ID parameters and has updated its discovery surface to include standard Google API parameters and mTLS support.

## Details

This update introduces breaking changes by marking 'applicationId' and 'dataTransferId' as strictly required parameters. Developers using these methods must ensure these identifiers are explicitly provided in requests to avoid validation errors. The API surface has also been refreshed to include standard global parameters such as 'xgafv' for error formatting and 'alt' for response selection. Additionally, the 'applications.get' method is now formally documented, and support for mTLS (mutual TLS) has been added via the 'mtlsRootUrl' endpoint.

**Tags:** `breaking-change` `admin-sdk` `security`
