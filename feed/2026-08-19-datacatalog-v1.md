---
date: 2026-08-19
api: datacatalog.v1
service: Data Catalog
title: "Data Catalog adds NODE and EDGE entry types"
impact: low
breaking: false
tags: ["metadata", "graph", "datacatalog"]
interesting_score: 5
status: released
lead_time_days: 0
official_release_date: "2026-07-09"
official_release_notes_url: "https://docs.cloud.google.com/dataplex/docs/release-notes#July_09_2026"
---


# Data Catalog adds NODE and EDGE entry types

**Date:** 2026-08-19  
**API:** `datacatalog.v1`  
**Impact:** Low  

## Summary

Data Catalog now supports graph-based metadata with new NODE and EDGE entry types, allowing for more granular classification of graph-related assets.

## Details

The GoogleCloudDatacatalogV1Entry schema has been updated to include two new enum values for the 'type' field: NODE and EDGE. These additions enable developers to represent graph database components or complex relational structures as distinct entries within the catalog, facilitating better organization and discovery of graph-oriented data assets.

**Tags:** `metadata` `graph` `datacatalog`
