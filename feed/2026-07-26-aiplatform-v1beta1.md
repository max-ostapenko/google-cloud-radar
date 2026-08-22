---
date: 2026-07-26
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI: Memory Bank Expansion & Breaking Agent Changes"
impact: high
breaking: true
tags: ["AI", "Vertex AI", "Agents", "Vector Search", "Reasoning Engine"]
interesting_score: 8
---

# Vertex AI: Memory Bank Expansion & Breaking Agent Changes

**Date:** 2026-07-26  
**API:** `aiplatform.v1beta1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

New event ingestion and profile retrieval methods for Memory Banks expand agentic capabilities, while breaking changes remove several fields from Agent and Tool result schemas.

## Details

Vertex AI's Reasoning Engine gains two significant methods: ingestEvents for Memory Banks and retrieveProfiles for memories, facilitating more sophisticated long-term state management for AI agents. On the Vector Search side, mutateDeployedIndex now supports an updateMask, allowing for partial updates to automatic_resources, dedicated_resources, and access_logging without requiring a full resource update. 

**Breaking Changes:** Developers should note the removal of maxTotalTokens from AgentInteraction. Additionally, the fields contentList, stringResult, and structResult have been removed from FunctionResultDelta, FunctionResultStep, McpServerToolResultDelta, and McpServerToolResultStep. This indicates a significant shift in how tool and function results are structured in streaming and step-based agent interactions.

**Tags:** `AI` `Vertex AI` `Agents` `Vector Search` `Reasoning Engine`
