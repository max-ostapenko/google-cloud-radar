---
date: 2026-07-24
api: bigqueryreservation.v1
service: BigQuery Reservation
title: "New reservationGroupPath field for hierarchical tracking"
impact: low
breaking: false
tags: ["bigquery", "reservations", "hierarchy"]
interesting_score: 5
---

# New reservationGroupPath field for hierarchical tracking

**Date:** 2026-07-24  
**API:** `bigqueryreservation.v1`  
**Impact:** Low  

## Summary

The Reservation resource now includes a read-only reservationGroupPath array, providing the full lineage of a reservation within hierarchical groups.

## Details

Building on the recently introduced hierarchical reservation groups, the Reservation schema now includes a `reservationGroupPath` field. This is an output-only array of strings that represents the path from the root group to the leaf parent (e.g., ["group-1", "group-2"]). This addition makes it significantly easier for developers to programmatically audit and visualize the position of a reservation within a nested hierarchy without manually traversing parent links.

**Tags:** `bigquery` `reservations` `hierarchy`
