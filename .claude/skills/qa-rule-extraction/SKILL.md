---
name: qa-rule-extraction
description: Extract source-traceable QA rules from approved product, screen, flow, and API documents.
---

# QA Rule Extraction

1. Read only relevant source documents, selected by `knowledge/INDEX.json`.
2. Emit a rule matrix before generating test cases.
3. Each rule must include `rule_id`, `condition`, `status`, `source_file`, and `source_section`.
4. Valid statuses are `CONFIRMED`, `INFERRED`, `MISSING`, and `CONFLICT`.
5. Do not resolve `MISSING` or `CONFLICT` by guessing.
