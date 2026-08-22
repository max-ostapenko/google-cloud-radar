---
date: 2026-08-09
api: bigqueryreservation.v1
service: BigQuery Reservation
title: "New jobType for Materialized View Refresh assignments"
impact: medium
breaking: false
tags: ["bigquery", "reservations", "materialized-views"]
interesting_score: 6
---

# New jobType for Materialized View Refresh assignments

**Date:** 2026-08-09  
**API:** `bigqueryreservation.v1`  
**Impact:** Medium  

## Summary

BigQuery now supports assigning reservations specifically for automated materialized view refreshes, allowing for better resource isolation and prioritization.

## Details

The Assignment resource's jobType enum now includes AUTOMATIC_MATERIALIZED_VIEW_REFRESH. Assignments using this job type will take priority over standard QUERY reservation assignments, enabling more granular control over background maintenance tasks and ensuring they do not compete directly with interactive queries unless intended.

**Tags:** `bigquery` `reservations` `materialized-views`
