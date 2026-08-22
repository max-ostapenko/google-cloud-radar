---
date: 2026-07-06
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI adds Claude-specific feature controls"
impact: low
breaking: false
tags: ["AI", "Vertex AI", "Anthropic", "Claude", "Data Retention"]
interesting_score: 6
---

# Vertex AI adds Claude-specific feature controls

**Date:** 2026-07-06  
**API:** `aiplatform.v1beta1`  
**Impact:** Low  

## Summary

Developers using Anthropic's Claude models on Vertex AI now have a dedicated configuration for advanced AI features and data retention opt-ins.

## Details

The `PublisherModelConfig` schema now includes a `claudeFeatureConfig` object. This object introduces `advancedAiEnabled`, a boolean field used to enable advanced AI features and opt-in to data retention. Simultaneously, the `cyberVerificationProgramEnabled` field has been deprecated in favor of this new, more broadly named parameter. This change indicates a shift in how Vertex AI handles the 'Cyber Verification Program' (CVP) and data retention policies specifically for the Claude model family.

**Tags:** `AI` `Vertex AI` `Anthropic` `Claude` `Data Retention`
