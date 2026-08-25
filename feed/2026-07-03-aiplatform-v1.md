---
date: 2026-07-03
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Memory management and Agent configuration updates"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Agents", "Memory"]
interesting_score: 7
status: released
lead_time_days: 0
official_release_date: "2025-09-15"
official_release_notes_url: "https://docs.cloud.google.com/vertex-ai/docs/release-notes#September_15_2025"
---


# Vertex AI adds Memory management and Agent configuration updates

**Date:** 2026-07-03  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI introduces long-running operation management for Memory resources and updates Agent scenario generation to support Gemini-based configurations.

## Details

New lifecycle operations (cancel, delete, get, list) have been added for 'memories' within the 'memoryBanks' resource hierarchy, providing standard management for long-running operations related to persistent AI memory. In the 'GenerateUserScenariosRequest' schema, the 'agents' and 'rootAgentId' fields have been changed from required to optional, provided that a 'gemini_agent_config' is supplied. Additionally, the 'enableDataRetention' field in 'ToolParallelAiSearch' is now deprecated in favor of 'enable_zero_data_retention'.

**Tags:** `AI` `Vertex AI` `Agents` `Memory`
