---
date: 2026-08-14
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Video Outpainting and Advanced Audio Control"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Generative Video", "Audio", "Agents"]
interesting_score: 7
---

# Vertex AI adds Video Outpainting and Advanced Audio Control

**Date:** 2026-08-14  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI expands its video generation experimental suite with new capabilities for outpainting, video-to-video transformations, and granular audio track management.

## Details

The video generation API receives significant experimental updates. A new `outpaintConfig` allows for video outpainting with specific resolution and frame count targets (e.g., 1920x1072 at 72 frames). The `audioControl` configuration enables developers to either reuse audio from an input video or provide a new target audio track via `CloudAiLargeModelsVisionGenerateVideoRequestAudio`. Additionally, a `videoTransform` schema has been introduced to handle noise strength and masking for video editing tasks, deprecating the older `videoTransformMaskGcsUri` and `videoTransformStrength` fields. Outside of video, the `AudioTranscriptionConfig` now deprecates `adaptationPhrases` in favor of `custom_vocabulary`, and the `agents.list` method has been clarified to only return resources owned by the specific calling end user.

**Tags:** `AI` `Vertex AI` `Generative Video` `Audio` `Agents`
