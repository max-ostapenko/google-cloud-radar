---
date: 2026-08-25
api: admin.directory_v1
service: Admin SDK Directory
title: "Major Schema Hardening and Granular OAuth Scopes"
impact: high
breaking: true
tags: ["breaking-change", "security", "identity", "iam"]
interesting_score: 9
---

# Major Schema Hardening and Granular OAuth Scopes

**Date:** 2026-08-25  
**API:** `admin.directory_v1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

The Directory API has undergone a significant hardening phase, making dozens of parameters strictly required and marking system-generated fields as read-only. It also introduces a wide array of granular OAuth2 scopes for more precise access control.

## Details

This update includes a massive list of breaking changes aimed at API consistency. Parameters such as `userKey`, `groupKey`, `customerId`, `deviceId`, and `orgUnitPath` are now strictly required across their respective methods; developers must ensure these are present in all requests to avoid validation errors. Additionally, many fields that were previously implicitly read-only are now explicitly marked as immutable in the schema, including `User` metadata (e.g., `creationTime`, `lastLoginTime`, `isAdmin`) and `ChromeOsDevice` status fields (e.g., `osVersionCompliance`, `diskSpaceUsage`). On the feature side, a comprehensive set of granular OAuth scopes has been added, allowing developers to request specific permissions for users, groups, devices, and printers rather than relying on broad administrative scopes.

**Tags:** `breaking-change` `security` `identity` `iam`
