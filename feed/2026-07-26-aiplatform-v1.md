---
date: 2026-07-26
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Audio Transcription and Memory Event Ingestion"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Audio", "Memory", "Video Generation"]
interesting_score: 7
---

# Vertex AI adds Audio Transcription and Memory Event Ingestion

**Date:** 2026-07-26  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI introduces native audio transcription schemas and expands agent memory capabilities with event ingestion. New controls for video generation rewriters and granular index endpoint updates are also now available.

## Details

A new set of schemas for Audio Transcription has been added, supporting speaker diarization, word-level timestamps, and language auto-detection. The Memory Bank resource now includes an 'ingestEvents' method, further maturing the agentic memory framework. For video generation, the 'omniRewriter' configuration allows tuning chunk durations and input FPS. Additionally, 'mutateDeployedIndex' now supports an 'updateMask', enabling partial updates for resources like 'dedicated_resources' and 'access_logging'.

**Tags:** `AI` `Vertex AI` `Audio` `Memory` `Video Generation`
