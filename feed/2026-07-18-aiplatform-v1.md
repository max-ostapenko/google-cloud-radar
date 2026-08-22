---
date: 2026-07-18
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds HTTP request forwarding and video alignment"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Video Generation", "Grounding"]
interesting_score: 7
---

# Vertex AI adds HTTP request forwarding and video alignment

**Date:** 2026-07-18  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI introduces a flexible HTTP forwarding method for publisher endpoints and adds experimental alignment controls for video generation and grounding observability.

## Details

A new method `projects.locations.publishers.v1.responses` has been added, allowing developers to forward arbitrary HTTP requests (streaming or non-streaming) using `GoogleApiHttpBody`. This requires an `invoke_route_prefix` to be configured. For video generation, the `CloudAiLargeModelsVisionGenerateVideoExperiments` schema now supports `colorAlignment` and `spatialAlignment` configurations. Additionally, `GoogleCloudAiplatformV1GroundingMetadata` now includes a `retrievalQueries` field, which exposes the specific queries executed by retrieval tools like Vertex AI Search, improving grounding transparency.

**Tags:** `AI` `Vertex AI` `Video Generation` `Grounding`
