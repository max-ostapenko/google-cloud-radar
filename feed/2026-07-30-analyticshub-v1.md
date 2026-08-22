---
date: 2026-07-30
api: analyticshub.v1
service: Analytics Hub
title: "Deprecation of proposer field in QueryTemplate"
impact: low
breaking: false
tags: ["deprecation", "analyticshub"]
interesting_score: 4
---

# Deprecation of proposer field in QueryTemplate

**Date:** 2026-07-30  
**API:** `analyticshub.v1`  
**Impact:** Low  

## Summary

The proposer field in the QueryTemplate schema is now formally deprecated in favor of primary_contact.

## Details

The analyticshub.v1 API has officially marked the proposer field within the QueryTemplate resource as deprecated. The API metadata now explicitly flags this field as deprecated and directs developers to use the primary_contact field instead for specifying the email or URL of the primary point of contact.

**Tags:** `deprecation` `analyticshub`
