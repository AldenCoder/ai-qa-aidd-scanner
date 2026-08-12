---
name: qa-automation
description: Generate Playwright/API automation only from approved testcases while preserving business assertions.
---

# QA Automation

1. Read `testcase/approved/approved_testcases.json`.
2. Generate tests with comments linking testcase IDs and rule IDs.
3. Do not automate `REVIEW_REQUIRED` or `REJECTED` testcases.
4. Repairs may update locators, waits, and setup data only.
5. Repairs must never change expected results or assertions to make a product bug pass.
