---
date: 2026-08-07
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Session Compaction and Audio API updates"
impact: medium
breaking: true
tags: ["AI", "Vertex AI", "Reasoning Engines", "Audio", "Evaluation"]
interesting_score: 7
---

# Vertex AI adds Session Compaction and Audio API updates

**Date:** 2026-08-07  
**API:** `aiplatform.v1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Reasoning Engines now support session history compaction to manage context windows via summarization. Audio transcription APIs are being streamlined with new language code fields, and evaluation runs gain CMEK support.

## Details

A new `compact` method for Reasoning Engine sessions allows for storage-side rewrites of event history. This includes LLM-based summarization and deterministic event editing, such as truncating oversized tool responses or stripping model 'thoughts' to stay within context limits. In the Audio API, `languageAuto` and `languageHints` are now deprecated in favor of a unified `languageCodes` array. Additionally, `EvaluationRun` resources now support `encryptionSpec` for Customer-Managed Encryption Keys (CMEK). Note a breaking change in usage metadata: the `trafficType` enum value `PROVISIONED_THROUGHPUT` has been replaced by `ON_DEMAND_OFFPEAK`.

**Tags:** `AI` `Vertex AI` `Reasoning Engines` `Audio` `Evaluation`
