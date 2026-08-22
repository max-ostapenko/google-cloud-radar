---
date: 2026-06-30
api: pagespeedonline.v5
service: PageSpeed Insights
title: "New score display modes for Lighthouse categories"
impact: low
breaking: false
tags: ["PageSpeed Insights", "Lighthouse", "Web Performance"]
interesting_score: 4
---

# New score display modes for Lighthouse categories

**Date:** 2026-06-30  
**API:** `pagespeedonline.v5`  
**Impact:** Low  

## Summary

The PageSpeed Insights API now includes metadata on how category scores should be visually represented, adding support for fractional scoring.

## Details

The 'LighthouseCategoryV5' schema has been updated with a new field 'categoryScoreDisplayMode'. This field provides guidance on whether a score should be rendered as a standard circular 'GAUGE' or as a 'FRACTION' (e.g., "3/5"). This is particularly useful for developers building custom dashboards or reporting tools that consume Lighthouse data via the API and want to match the official Lighthouse UI behavior.

**Tags:** `PageSpeed Insights` `Lighthouse` `Web Performance`
