---
date: 2026-05-28
api: datalineage.v1
service: Data Lineage
title: "Clarified location requirements for lineage search"
impact: low
breaking: false
tags: ["data-lineage", "documentation"]
interesting_score: 2
status: released
lead_time_days: 1
official_release_date: "2026-05-29"
official_release_notes_url: "https://docs.cloud.google.com/dataplex/docs/release-notes#May_29_2026"
---


# Clarified location requirements for lineage search

**Date:** 2026-05-28  
**API:** `datalineage.v1`  
**Impact:** Low  

## Summary

The Data Lineage API now explicitly requires that the locations list in streaming search requests includes the location specified in the parent field.

## Details

A documentation update to SearchLineageStreamingRequest clarifies that the locations parameter is not just a general list, but must specifically contain the location provided in the parent field. This helps prevent validation errors when performing streaming lineage searches by ensuring consistency between the parent resource path and the search scope.

**Tags:** `data-lineage` `documentation`
