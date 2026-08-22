---
date: 2026-08-14
api: aiplatform.v1beta1
service: Vertex AI
title: "Video Outpainting, Audio Control, and Monitoring Refinements"
impact: medium
breaking: true
tags: ["AI", "Vertex AI", "Video Generation", "Agents", "Speech"]
interesting_score: 7
---

# Video Outpainting, Audio Control, and Monitoring Refinements

**Date:** 2026-08-14  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Vertex AI introduces advanced video generation capabilities including outpainting and audio control, while refining agent monitoring filters and deprecating legacy ASR fields.

## Details

The GenerateVideo experimental suite expands significantly with OutpaintConfig (supporting resolutions up to 1920x1072 and frame counts up to 432), AudioControlConfig for managing target audio tracks, and VideoTransform for video-to-video editing (SDEdit/DiffDiff) with noise strength control. On the monitoring front, analyzedSessions.list now requires canonical enum names for severity filtering (e.g., SEVERITY_CRITICAL instead of CRITICAL) and adds agent_type filtering for runtimes like CLOUD_RUN_SERVICE and GKE_WORKLOAD. Additionally, adaptationPhrases is deprecated in favor of custom_vocabulary for speech recognition. Several GenaiVertexV1beta1 fields related to CodeMender and specific MIME type enums for audio/document content have been removed, continuing the API's recent cleanup of experimental agentic schemas.

**Tags:** `AI` `Vertex AI` `Video Generation` `Agents` `Speech`
