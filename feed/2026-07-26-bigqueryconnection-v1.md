---
date: 2026-07-26
api: bigqueryconnection.v1
service: BigQuery Connection API
title: "TLS Configuration for BigQuery Connections"
impact: medium
breaking: false
tags: ["bigquery", "security", "tls", "networking"]
interesting_score: 7
---

# TLS Configuration for BigQuery Connections

**Date:** 2026-07-26  
**API:** `bigqueryconnection.v1`  
**Impact:** Medium  

## Summary

BigQuery connections now support granular TLS configuration, including support for Private PKI and custom CA certificates.

## Details

The ConnectorConfiguration schema now includes a 'tls' field, allowing developers to specify TLS modes such as 'ENCRYPT_VERIFY_CA' or 'ENCRYPT_VERIFY_CA_AND_HOST'. Additionally, new schemas for 'ConnectorConfigurationTlsPrivatePki' and 'ConnectorConfigurationTlsWebPki' have been added, enabling the use of PEM-encoded trusted certificates for private certificate authorities. This allows for more secure connections to external data sources that require specific encryption and verification standards.

**Tags:** `bigquery` `security` `tls` `networking`
