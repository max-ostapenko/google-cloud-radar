---
date: 2026-06-21
api: dataform.v1beta1
service: Dataform
title: "Dataform introduces event-driven triggers and Git links"
impact: high
breaking: false
tags: ["data-pipelines", "automation", "git", "bigquery"]
interesting_score: 8
---

# Dataform introduces event-driven triggers and Git links

**Date:** 2026-06-21  
**API:** `dataform.v1beta1`  
**Impact:** High  

## Summary

Dataform workflows can now be triggered automatically by table updates, and Git remote settings now support direct repository links for machine credentials.

## Details

This update introduces a robust triggering system for Dataform workflows. The new `WorkflowTriggerConfig` allows developers to define `TableUpdateTrigger` conditions, enabling workflows to execute automatically when a specific target table is modified. The configuration supports logical conditions (ALL/ANY), rate limiting via `minExecutionDuration`, and observability through `recentTriggerEvaluationRecords`. Additionally, `GitRemoteSettings` now includes a `gitRepositoryLink` field, allowing integration with standard GCP Git repository connections for machine-based authentication.

**Tags:** `data-pipelines` `automation` `git` `bigquery`
