# AI QA PoC Instructions

- Treat `knowledge/` as canonical source of truth.
- Treat `testcase/`, `evidence/`, `bugs/`, `reports/`, and `evals/results/` as generated artifacts.
- Never create an expected result unless it has a confirmed rule id and source.
- Testcases with `MISSING` or `CONFLICT` rule status must remain `REVIEW_REQUIRED`.
- Automation is generated only from `APPROVED` testcases.
- A repair/healing step may update locators or waits, but must not weaken business assertions or change expected results.
