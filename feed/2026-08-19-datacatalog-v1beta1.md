---
date: 2026-08-19
api: datacatalog.v1beta1
service: Data Catalog
title: "Data Catalog adds support for Graph Nodes and Edges"
impact: medium
breaking: false
tags: ["Data Catalog", "Metadata", "Graph Databases"]
interesting_score: 5
status: released
lead_time_days: 0
official_release_date: "2026-07-09"
official_release_notes_url: "https://docs.cloud.google.com/dataplex/docs/release-notes#July_09_2026"
---


# Data Catalog adds support for Graph Nodes and Edges

**Date:** 2026-08-19  
**API:** `datacatalog.v1beta1`  
**Impact:** Medium  

## Summary

Data Catalog now supports NODE and EDGE entry types, enabling metadata management for graph-based data structures.

## Details

The GoogleCloudDatacatalogV1Entry schema has been updated to include two new enum values for the 'type' field: NODE and EDGE. These additions allow developers to categorize and discover graph nodes and edges within the Data Catalog, expanding the service's utility for graph database integrations and complex relationship mapping.

**Tags:** `Data Catalog` `Metadata` `Graph Databases`
