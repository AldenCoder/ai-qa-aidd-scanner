---
name: qa-test-design
description: Generate manual testcases from a validated rule matrix with boundary and negative coverage.
---

# QA Test Design

1. Generate boundary tests for numeric rules.
2. Generate required-field and negative-data tests for validation rules.
3. Every expected result must cite confirmed rule IDs and sources.
4. For `MISSING` or `CONFLICT`, set `expected_result` to null and `approval_status` to `REVIEW_REQUIRED`.
