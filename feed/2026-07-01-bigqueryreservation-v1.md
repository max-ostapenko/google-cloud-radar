---
date: 2026-07-01
api: bigqueryreservation.v1
service: BigQuery Reservation
title: "Hierarchical Reservation Groups and Flex Plan Deprecation"
impact: medium
breaking: false
tags: ["bigquery", "reservations", "deprecation"]
interesting_score: 7
---

# Hierarchical Reservation Groups and Flex Plan Deprecation

**Date:** 2026-07-01  
**API:** `bigqueryreservation.v1`  
**Impact:** Medium  

## Summary

BigQuery Reservation API adds support for updating reservation groups and hierarchical structures while deprecating Flex capacity commitments.

## Details

A new `patch` method is now available for `reservationGroups`, allowing for updates to existing resources via `projects.locations.reservationGroups.patch`. The `ReservationGroup` schema has been extended with a `parentGroup` field, enabling the creation of hierarchical reservation structures. Concurrently, the `FLEX` commitment plan has been marked as deprecated in both the `plan` and `renewalPlan` fields of the `CapacityCommitment` schema, with guidance to transition to Edition-based capacity commitments.

**Tags:** `bigquery` `reservations` `deprecation`
