---
date: 2026-07-03
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI: New Memory Bank Resources and Agent Refinements"
impact: medium
breaking: true
tags: ["AI", "Vertex AI", "Agents", "Grounding", "Reasoning Engine"]
interesting_score: 7
---

# Vertex AI: New Memory Bank Resources and Agent Refinements

**Date:** 2026-07-03  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Vertex AI introduces MemoryBanks and Memories for persistent agent state management, alongside schema refinements for Monitored Agents and user scenario generation.

## Details

This update introduces a significant new resource hierarchy: `memoryBanks` and its child `memories`. These resources, which include full support for long-running operations (LROs), appear to be designed for persistent state management within the Reasoning Engine framework. In the Agents space, `GenerateUserScenariosRequest` has been made more flexible; the `agents` map and `rootAgentId` are now optional when a `gemini_agent_config` is provided. 

There are also breaking changes and deprecations to note: `MonitoredAgent` has had its `logBuckets` and `observabilityBuckets` fields removed. Additionally, in the grounding tools, `enableDataRetention` within `ToolParallelAiSearch` is now deprecated in favor of the more explicitly named `enable_zero_data_retention`. Finally, the `analyzedSessions.list` method now supports sorting by `agent_display_name`, improving observability workflows.

**Tags:** `AI` `Vertex AI` `Agents` `Grounding` `Reasoning Engine`
