---
date: 2026-08-22
api: aiplatform.v1beta1
service: Vertex AI
title: "Smart Transcription, Multi-Speaker Config, and Agentic Video"
impact: medium
breaking: true
tags: ["AI", "Vertex AI", "Generative AI", "Video", "Speech"]
interesting_score: 8
---

# Smart Transcription, Multi-Speaker Config, and Agentic Video

**Date:** 2026-08-22  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Vertex AI adds a 'Smart' transcription mode for automated cleanup of audio transcripts and introduces multi-speaker configurations. Video generation is enhanced with a new 'Extend' task and agentic processing modes for dynamic frame navigation.

## Details

The GenaiVertexV1beta1TranscriptionConfig now includes a `mode` field; the `SMART` mode performs disfluency removal (filler words, repetitions) and grammatical cleanup, though it is incompatible with timestamps and diarization. For speech generation, the array-based `speechConfig` has been replaced by `structuredSpeechConfig`, utilizing the new `GenaiVertexV1beta1SpeakerConfig` to support multi-speaker setups. 

Video generation capabilities expand with the `EXTEND` task in `GenaiVertexV1beta1VideoConfig`. Furthermore, `GenaiVertexV1beta1VideoContent` introduces `processingType`, enabling `AGENTIC` dynamic navigation (the new default for Gemini 1.5 Pro+ models) as an alternative to `STATIC` fixed-rate frame extraction. Developers can also now specify video output resolutions up to 4K. Finally, the `base_agent` field in the Agent resource is now immutable, requiring a new agent creation for base model changes.

**Tags:** `AI` `Vertex AI` `Generative AI` `Video` `Speech`
