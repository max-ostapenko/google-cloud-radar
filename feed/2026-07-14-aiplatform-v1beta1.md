---
date: 2026-07-14
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI adds Memory Bank CRUD and Streaming Event updates"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Agents", "Reasoning Engine", "Streaming"]
interesting_score: 7
---

# Vertex AI adds Memory Bank CRUD and Streaming Event updates

**Date:** 2026-07-14  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  

## Summary

Vertex AI expands its Reasoning Engine capabilities with full CRUD support for Memory Banks and introduces a distinction between legacy and step-based streaming events.

## Details

New methods `create`, `delete`, `list`, and `generate` have been added to the `memoryBanks.memories` resource, enabling persistent state management for agentic workflows. The `GenaiVertexV1beta1InteractionStreamingEvent` schema now explicitly differentiates between legacy content-based events (used when steps are disabled) and new step-based events (used when steps are enabled), providing better clarity for developers building streaming interfaces. Additionally, filtering and sorting documentation for `monitoredAgents` and `analyzedSessions` has been refined to clarify AIP-160 and AIP-132 compliance, specifically regarding severity rankings and detection time windows.

**Tags:** `AI` `Vertex AI` `Agents` `Reasoning Engine` `Streaming`
