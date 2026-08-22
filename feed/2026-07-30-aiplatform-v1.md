---
date: 2026-07-30
api: aiplatform.v1
service: Vertex AI
title: "Vertex AI adds Compact HTTP Forwarding and Serving Operations"
impact: medium
breaking: false
tags: ["AI", "Vertex AI", "Operations", "HTTP Proxy"]
interesting_score: 6
---

# Vertex AI adds Compact HTTP Forwarding and Serving Operations

**Date:** 2026-07-30  
**API:** `aiplatform.v1`  
**Impact:** Medium  

## Summary

Vertex AI introduces a 'compact' HTTP forwarding method for publisher endpoints and adds standard long-running operation management for Serving Profiles.

## Details

The new `projects.locations.publishers.v1.responses.compact` method allows developers to forward arbitrary HTTP requests (streaming and non-streaming) to deployed models, requiring an `invoke_route_prefix` for path authorization. The `servingProfiles` resource has also been expanded with standard long-running operation (LRO) methods—`get`, `list`, `cancel`, and `delete`—improving the management of asynchronous tasks. Finally, the `OnlineEvaluator` trace scope predicate now explicitly defines its duration filter in seconds.

**Tags:** `AI` `Vertex AI` `Operations` `HTTP Proxy`
