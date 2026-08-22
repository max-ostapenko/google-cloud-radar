---
date: 2026-07-01
api: tagmanager.v2
service: Tag Manager
title: "New Automatic Number Conversion and Error Schema Cleanup"
impact: medium
breaking: true
tags: ["Tag Manager", "Variables", "Schema Change"]
interesting_score: 7
---

# New Automatic Number Conversion and Error Schema Cleanup

**Date:** 2026-07-01  
**API:** `tagmanager.v2`  
**Impact:** Medium  
**⚠️ Breaking change**  

## Summary

Added automatic decimal separator detection for variable formatting and significantly reduced the surface area of the CompilerErrorLite schema.

## Details

The VariableFormatValue schema now includes an 'automatic' option for the convertToNumber property, which enables automatic decimal separator detection when formatting variables. On the reporting side, the CompilerErrorLite schema has undergone a major reduction, with the removal of the errorMessage field and nearly 50 specific errorType enum values (such as invalidRegex, macroCycle, and jsCompilerError). Developers relying on these granular error codes for automated container validation or debugging tools should review their implementations.

**Tags:** `Tag Manager` `Variables` `Schema Change`
