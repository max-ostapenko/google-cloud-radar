---
date: 2026-08-25
api: androidpublisher.v3
service: Android Publisher
title: "Massive Schema Tightening and New Data Safety Method"
impact: high
breaking: true
tags: ["breaking change", "google play", "android"]
interesting_score: 9
---

# Massive Schema Tightening and New Data Safety Method

**Date:** 2026-08-25  
**API:** `androidpublisher.v3`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

Dozens of parameters are now strictly required and many schema fields have become read-only, alongside a new method for Safety Labels.

## Details

The Android Publisher API is undergoing a major validation cleanup. A vast array of parameters—including 'packageName', 'editId', 'subscriptionId', 'productId', and 'token'—are now strictly required across most methods. Additionally, numerous fields in schemas like 'ExternalTransaction', 'Subscription', 'AppEdit', and 'User' have been marked as read-only or immutable. Developers should audit their integrations to ensure all required parameters are supplied and that they are not attempting to write to now-immutable fields. On the feature side, a new 'applications.dataSafety' method has been added to allow developers to programmatically write Safety Labels declarations.

**Tags:** `breaking change` `google play` `android`
