---
date: 2026-06-21
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI Beta: New Governance Engines and Breaking Agent Changes"
impact: high
breaking: true
tags: ["AI", "Agents", "Governance", "Breaking Change"]
interesting_score: 8
---

# Vertex AI Beta: New Governance Engines and Breaking Agent Changes

**Date:** 2026-06-21  
**API:** `aiplatform.v1beta1`  
**Impact:** High  
**⚠️ Breaking change**  

## Summary

This update introduces Semantic Governance Policy Engines and Agent Anomaly Detection while introducing several breaking changes to the Agents and Interactions APIs.

## Details

Vertex AI has added a singleton `SemanticGovernancePolicyEngine` resource for location-level policy management and a new `AgentAnomalyDetectionScope` resource. Significant breaking changes include the removal of the `interactions.delete` method and making `skillId` a required parameter in `skills.create`. Additionally, the `agents.list` method now uses `created` and `updated` for its `orderBy` parameter instead of `create_time` and `update_time`. Developers using Model Context Protocol (MCP) should note that the `AgentTool` type `mcp` has been renamed to `mcp_server`.

**Tags:** `AI` `Agents` `Governance` `Breaking Change`
