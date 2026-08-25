---
date: 2026-06-21
api: connectors.v2
service: Application Integration Connectors
title: "Generic HTTP request execution added to Connectors"
impact: high
breaking: false
tags: ["integrations", "http", "extensibility"]
interesting_score: 8
status: released
lead_time_days: 51
official_release_date: "2026-08-11"
official_release_notes_url: "https://docs.cloud.google.com/bigquery/docs/release-notes#August_11_2026"
---


# Generic HTTP request execution added to Connectors

**Date:** 2026-06-21  
**API:** `connectors.v2`  
**Impact:** High  

## Summary

Integration Connectors now supports a raw executeHttpRequest method, allowing developers to send arbitrary HTTP requests through existing connections.

## Details

A new method `executeHttpRequest` has been added to the `connections` resource. This allows for sending raw byte payloads (via `rawBody`) and custom headers, supporting REST, GraphQL, XML, and SOAP directly through the connector's auth context. Additionally, the `tools.list` method now includes a `toolNames` query parameter for selective tool fetching.

**Tags:** `integrations` `http` `extensibility`
