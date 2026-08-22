---
date: 2026-06-21
api: bigquerydatatransfer.v1
service: BigQuery Data Transfer Service
title: "Dataplex Universal Catalog integration for Data Transfers"
impact: medium
breaking: false
tags: ["bigquery", "dataplex", "governance", "metadata"]
interesting_score: 7
---

# Dataplex Universal Catalog integration for Data Transfers

**Date:** 2026-06-21  
**API:** `bigquerydatatransfer.v1`  
**Impact:** Medium  

## Summary

BigQuery Data Transfer Service now supports automated metadata import into Dataplex Universal Catalog during data transfers.

## Details

A new `metadataDestination` field has been added to both `TransferConfig` and `TransferRun` resources. This field utilizes the newly introduced `DataplexConfiguration` schema, allowing developers to specify a Dataplex `entryGroup` (formatted as `projects/{project_id}/locations/{region}/entryGroups/{entry_group_id}`) where transfer metadata should be cataloged. This effectively bridges the gap between data movement and data governance within the GCP ecosystem.

**Tags:** `bigquery` `dataplex` `governance` `metadata`
