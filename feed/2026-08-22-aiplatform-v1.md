---
date: 2026-08-22
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Response Management and Smart Transcription"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Audio", "Agents"]
interesting_score: 7
---

# Vertex AI adds Response Management and Smart Transcription

**Date:** 2026-08-22  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI introduces lifecycle management for endpoint responses and a new "Smart" mode for audio transcription that automatically cleans up disfluencies.

## Details

New GET and DELETE methods have been added to the 'responses' sub-resource for both Endpoints and Publishers, allowing developers to retrieve or remove specific response data. The AudioTranscriptionConfig now includes a 'mode' parameter; the new 'SMART' mode automates disfluency removal (filler words, repetitions) and formatting cleanup, though it disables timestamps and diarization. Additionally, the 'base_agent' field in the Agent schema is now explicitly marked as Immutable, requiring a new agent to be created if the base model needs to change. Finally, documentation for GatewayConfig.dnsZoneName was clarified to require the zone resource name rather than the FQDN.

**Tags:** `AI` `Vertex AI` `Audio` `Agents`
