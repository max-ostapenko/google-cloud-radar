---
date: 2026-06-27
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI introduces Agents and Semantic Governance resources"
impact: high
breaking: false
tags: ["AI", "Vertex AI", "Agents", "Governance"]
interesting_score: 9
---

# Vertex AI introduces Agents and Semantic Governance resources

**Date:** 2026-06-27  
**API:** `aiplatform.v1`  
**Impact:** High  

## Summary

Vertex AI has significantly expanded its v1 API surface, introducing dedicated resources for managing AI Agents and a new Semantic Governance Policy Engine.

## Details

This update adds over 500 new paths to the discovery document, primarily centered around two new resource types. The `projects.locations.agents` resource allows for the programmatic creation, retrieval, and deletion of AI agents. Additionally, the `projects.locations.semanticGovernancePolicyEngine` resource has been introduced as a singleton for managing semantic governance policies at the location level, supporting `get` and `update` (upsert) operations. Many of these new operations, such as agent creation and policy updates, are implemented as Long Running Operations (LROs).

**Tags:** `AI` `Vertex AI` `Agents` `Governance`
