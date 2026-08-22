---
date: 2026-06-23
api: datalineage.v1
service: Data Lineage
title: "New ingestion rule integrations for BigQuery and Airflow"
impact: medium
breaking: false
tags: ["datalineage", "bigquery", "composer", "airflow"]
interesting_score: 6
---

# New ingestion rule integrations for BigQuery and Airflow

**Date:** 2026-06-23  
**API:** `datalineage.v1`  
**Impact:** Medium  

## Summary

The Data Lineage API now supports BigQuery and Managed Service for Apache Airflow (Cloud Composer) in ingestion rule configurations.

## Details

The `integration` enum within the `IngestionRuleIntegrationSelector` schema has been expanded. New supported integration types include `BIGQUERY`, `LOOKER_CORE`, and `MANAGED_AIRFLOW` (Cloud Composer). This allows developers to programmatically configure and filter lineage ingestion rules specifically for these services, providing more granular control over how data lineage is captured across the GCP ecosystem.

**Tags:** `datalineage` `bigquery` `composer` `airflow`
