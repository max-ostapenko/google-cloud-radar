---
date: 2026-07-06
api: bigquerydatatransfer.v1
service: BigQuery Data Transfer Service
title: "Removal of metadataDestination from TransferRun"
impact: medium
breaking: true
tags: ["bigquery", "breaking-change"]
interesting_score: 5
---

# Removal of metadataDestination from TransferRun

**Date:** 2026-07-06  
**API:** `bigquerydatatransfer.v1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

The output-only metadataDestination field has been removed from the TransferRun resource schema.

## Details

The TransferRun schema has been modified to remove the metadataDestination property. This field was previously used to provide output-only information about the destination of transfer run metadata. While it was a read-only field, its removal may break client-side parsers or logic that explicitly expects this field in API responses.

**Tags:** `bigquery` `breaking-change`
