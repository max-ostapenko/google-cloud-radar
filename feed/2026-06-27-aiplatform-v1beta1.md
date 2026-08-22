---
date: 2026-06-27
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI Beta: Computer Use Safety & Breaking Agent Changes"
impact: high
breaking: true
tags: ["AI", "Vertex AI", "Generative AI", "Breaking Change"]
interesting_score: 8
---

# Vertex AI Beta: Computer Use Safety & Breaking Agent Changes

**Date:** 2026-06-27  
**API:** `aiplatform.v1beta1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

Vertex AI adds prompt injection detection for computer-use tasks and Zero Data Retention for Parallel AI Search, alongside significant removals of Agent-related methods.

## Details

This update introduces `enablePromptInjectionDetection` and new environment enums (`MOBILE`, `DESKTOP`) to the `GenaiVertexV1beta1ComputerUse` schema. Grounding capabilities are expanded with `enableDataRetention` in `GoogleCloudAiplatformV1beta1ToolParallelAiSearch`, allowing users to opt into Parallel's Zero Data Retention Marketplace product. Additionally, `AgentAnomalyDetectionScope` now includes a `state` field to track lifecycle status (e.g., CREATING, ACTIVE, FAILED).

However, there are several breaking changes: the `patch` method for `agentAnomalyDetectionScopes` and the `create`/`delete` methods for `monitoredAgents` have been removed. Furthermore, the `CodeMender` agent configuration and its associated schemas have been entirely excised from the API surface.

**Tags:** `AI` `Vertex AI` `Generative AI` `Breaking Change`
