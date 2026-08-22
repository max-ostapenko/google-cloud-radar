---
date: 2026-08-06
api: dataform.v1beta1
service: Dataform
title: "Support for Notebooks, SQL assets, and GCS snapshots"
impact: medium
breaking: false
tags: ["dataform", "notebooks", "sql", "gcs"]
interesting_score: 7
---

# Support for Notebooks, SQL assets, and GCS snapshots

**Date:** 2026-08-06  
**API:** `dataform.v1beta1`  
**Impact:** Medium  

## Summary

Dataform is expanding beyond standard projects to support single-file SQL and Notebook assets, alongside GCS-based repository snapshots for scheduled executions.

## Details

A new `PipelineConfig` schema has been introduced and integrated into `CodeCompilationConfig`, `WorkflowInvocation`, and `InstallNpmPackagesRequest`. This allows developers to explicitly define a `pipelineType` (DATAFORM, SQL, or NOTEBOOK) and a relative `path` within the Git repository. Furthermore, the API now supports repository snapshots in Google Cloud Storage for scheduled notebooks, evidenced by new `gcsRepositorySnapshotDestination` settings in `NotebookRuntimeOptions` and corresponding metadata in `CompilationResult`.

**Tags:** `dataform` `notebooks` `sql` `gcs`
