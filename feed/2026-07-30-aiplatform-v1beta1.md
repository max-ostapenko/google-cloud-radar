---
date: 2026-07-30
api: aiplatform.v1beta1
service: Vertex AI
title: "Vertex AI: Task Stores, Speech Transcription, and Model Proxies"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Agents", "Generative AI", "Speech"]
interesting_score: 7
---

# Vertex AI: Task Stores, Speech Transcription, and Model Proxies

**Date:** 2026-07-30  
**API:** `aiplatform.v1beta1`  
**Impact:** Medium  

## Summary

Vertex AI expands agentic capabilities with Task Stores for decoupled task management and integrated speech-to-text transcription for generative models.

## Details

The Reasoning Engine's A2A (Agent-to-Agent) task framework has been significantly updated; tasks can now be managed via a new `taskStores` resource path, decoupling task persistence from the execution engine. For Generative AI workflows, a new `transcriptionConfig` in `GenaiVertexV1beta1GenerationConfig` enables integrated speech recognition (ASR). Additionally, the API introduces `publishers.v1.responses.compact`, a method for forwarding arbitrary HTTP requests to deployed models, supporting both streaming and non-streaming use cases. Agent monitoring has also been broadened, with `AgentResource` now supporting runtimes on Cloud Run, GKE, and GCE. Finally, a new `QUEUED` status has been added to interactions to represent tasks waiting for off-peak capacity.

**Tags:** `AI` `Vertex AI` `Agents` `Generative AI` `Speech`
