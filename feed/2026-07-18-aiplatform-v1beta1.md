---
date: 2026-07-18
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI: Breaking GenAI Schema Changes & New Retrieval Tools"
impact: high
breaking: true
tags: ["AI", "Vertex AI", "Generative AI", "Agents", "Video Generation"]
interesting_score: 9
---

# Vertex AI: Breaking GenAI Schema Changes & New Retrieval Tools

**Date:** 2026-07-18  
**API:** `aiplatform.v1beta1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

This update introduces significant breaking changes by removing generation penalties and caching fields, while adding new proxy methods for model responses and expanding retrieval tool support for agents.

## Details

Several breaking changes have been introduced to the GenAI schemas: `frequency_penalty`, `presence_penalty`, and `cached_content` have been removed from `GenaiVertexV1beta1GenerationConfig` and `GenaiVertexV1beta1ModelInteraction`. Developers relying on these for fine-tuning output diversity or context caching will need to adjust their implementations. On the feature side, a new `publishers.v1.responses` method allows for forwarding arbitrary HTTP requests to deployed models, supporting both streaming and non-streaming cases. 

Additionally, the retrieval framework for agents has been expanded with `GenaiVertexV1beta1RetrievalCallDelta` and `RetrievalCallStep`, which now support new tools including `EXA_AI_SEARCH` and `PARALLEL_AI_SEARCH`. Video generation capabilities are also being refined with new experimental configurations for `spatialAlignment` and `colorAlignment`. Finally, `inferenceEventLoggingConfig` has been updated to clarify that it now covers all publisher-model traffic, including both Provisioned Throughput and on-demand usage.

**Tags:** `AI` `Vertex AI` `Generative AI` `Agents` `Video Generation`
