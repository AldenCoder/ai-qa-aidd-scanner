---
name: qa-review
description: Review generated testcases for source grounding, missing rules, conflicts, duplicates, and unsupported expected results.
---

# QA Review

Reject a testcase when:

- Expected result has no confirmed source.
- Rule IDs do not match the cited source.
- A business assertion is inferred from a generated artifact.
- The case duplicates another approved testcase.

Approve only testcases that pass schema, grounding, and duplicate checks.
