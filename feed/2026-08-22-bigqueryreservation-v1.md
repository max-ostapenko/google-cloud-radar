---
date: 2026-08-22
api: bigqueryreservation.v1
service: BigQuery Reservation
title: "CEL Conditions and Precedence for Reservation Assignments"
impact: medium
breaking: false
tags: ["bigquery", "reservations", "cel", "governance"]
interesting_score: 7
---

# CEL Conditions and Precedence for Reservation Assignments

**Date:** 2026-08-22  
**API:** `bigqueryreservation.v1`  
**Impact:** Medium  

## Summary

BigQuery is introducing logic-based reservation assignments using Common Expression Language (CEL) and a new precedence system to resolve matching conflicts.

## Details

The Assignment resource now includes a 'condition' field, which accepts a Common Expression Language (CEL) expression to define matching criteria for jobs. To handle scenarios where multiple assignments might match a single job, a new 'precedence' field (int64) has been added; higher values take priority. Additionally, the ReservationGroup schema now includes 'creationTime' and 'updateTime' output-only fields for better resource auditing.

**Tags:** `bigquery` `reservations` `cel` `governance`
