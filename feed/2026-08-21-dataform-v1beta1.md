---
date: 2026-08-21
api: dataform.v1beta1
service: Dataform
title: "Git branch management arrives for Dataform Workspaces"
impact: medium
breaking: false
tags: ["dataform", "git", "workspaces", "automation"]
interesting_score: 7
---

# Git branch management arrives for Dataform Workspaces

**Date:** 2026-08-21  
**API:** `dataform.v1beta1`  
**Impact:** Medium  

## Summary

Dataform Workspaces now support native Git branch operations including checkout, fetch, and delete, enabling better programmatic control over development environments.

## Details

Four new methods have been added to the Workspace resource: 'checkout', 'deleteBranch', 'fetchBranches', and 'fetchCurrentBranch'. The 'fetchBranches' method includes a filter parameter to distinguish between local and remote branches (LOCAL_ONLY, REMOTE_ONLY, ALL), while 'checkout' allows switching the active branch within a workspace. These additions facilitate more complex automation and CI/CD integration directly through the Dataform API without requiring external Git tooling for basic branch navigation.

**Tags:** `dataform` `git` `workspaces` `automation`
