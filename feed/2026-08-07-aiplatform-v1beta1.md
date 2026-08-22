---
date: 2026-08-07
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI: Session Compaction and Transcription Refactor"
impact: medium
breaking: true
tags: ["AI", "Vertex AI", "Agents", "Generative AI", "Speech"]
interesting_score: 8
---

# Vertex AI: Session Compaction and Transcription Refactor

**Date:** 2026-08-07  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Vertex AI introduces session compaction for long-running agent histories and standardizes speech transcription configurations, alongside a breaking change to traffic type enums.

## Details

A new `compact` method has been added to Reasoning Engine sessions (`projects.locations.reasoningEngines.sessions.compact`). This allows developers to manage context window limits by applying a 'stackable pipeline' of rules to session history, including LLM-based summarization, tool-response truncation, and 'thought stripping.' In transcription news, `languageHints` and `languageAuto` are being deprecated or removed across `GenaiVertexV1beta1TranscriptionConfig` and `GoogleCloudAiplatformV1beta1AudioTranscriptionConfig` in favor of a unified `languageCodes` array. Additionally, `GenaiVertexV1beta1EnvironmentConfig` has moved from camelCase to snake_case for `network_allowlist` and `network_mode` fields.

**Breaking Change:** The `trafficType` enum used in `UsageMetadata` has changed its 5th value (index 4) from `PROVISIONED_THROUGHPUT` to `ON_DEMAND_OFFPEAK`. Developers relying on this specific enum value for billing or monitoring logic should update their code immediately.

**Tags:** `AI` `Vertex AI` `Agents` `Generative AI` `Speech`
