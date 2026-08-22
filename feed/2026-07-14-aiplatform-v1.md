---
date: 2026-07-14
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds CRUD and Generation for Agent Memories"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Agents", "Memory"]
interesting_score: 8
---

# Vertex AI adds CRUD and Generation for Agent Memories

**Date:** 2026-07-14  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI expands its memory management capabilities, allowing developers to create, list, and automatically generate persistent memories for AI agents within the Reasoning Engine framework.

## Details

The update introduces the `projects.locations.memoryBanks.memories` resource hierarchy. Key additions include `create` and `delete` methods (both implemented as Long Running Operations), a `list` method with filtering support for `scope` and `topics`, and a specialized `generate` method for bulk memory creation. While the resource path uses `memoryBanks`, the documentation indicates these are intended for use with `ReasoningEngine` instances, facilitating persistent state and long-term context across agentic workflows.

**Tags:** `AI` `Vertex AI` `Agents` `Memory`
