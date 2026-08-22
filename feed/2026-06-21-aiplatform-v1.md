---
date: 2026-06-21
api: aiplatform.v1
service: Vertex AI
title: "Online Evaluator Operations and GenerationConfig Deprecations"
impact: medium
breaking: false
tags: ["AI", "Generative AI", "Deprecation", "Infrastructure"]
interesting_score: 7
---

# Online Evaluator Operations and GenerationConfig Deprecations

**Date:** 2026-06-21  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI adds full operation management for Online Evaluators and marks several core GenerationConfig fields as deprecated in favor of a unified response format.

## Details

The API introduces a new `onlineEvaluators.operations` resource, enabling standard LRO management (get, list, cancel, delete) for evaluation tasks. Significant deprecations hit `GenerationConfig`: the fields `response_schema`, `response_mime_type`, `response_json_schema`, and `image_config` are now deprecated, with developers directed to use the new `response_format` field. Additionally, `PersistentDiskSpec` has been expanded to support Hyperdisk types (including `hyperdisk-ml` and `hyperdisk-balanced`), and Google Maps grounding widgets are being phased out. Note the documentation shift where 'Vertex AI' is being rebranded as 'Agent Platform' in several resource descriptions.

**Tags:** `AI` `Generative AI` `Deprecation` `Infrastructure`
