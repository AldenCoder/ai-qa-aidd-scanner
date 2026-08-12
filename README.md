# AI QA Test Case Writer

Small system for generating tester-ready test cases from project documents, source code, or a public GitHub repository.

Main flow:

```text
docs/code/GitHub -> requirement/API/UI discovery -> test case draft
-> tester review status -> JSON/CSV export -> optional automation sample
```

The primary output is a test case table with:

- priority
- test type
- preconditions
- test data
- execution steps
- expected result
- source traceability
- review status
- automation hint

API/UI/security are coverage groups inside the generated test cases. They are not the main product screen.

## Run

```bash
npm install
npm start
```

Open:

- Test Case Writer: `http://127.0.0.1:3200`
- Sample app: `http://127.0.0.1:3200/demo`
- Latest JSON export: `http://127.0.0.1:3200/api/testcases/export.json`
- Latest CSV export: `http://127.0.0.1:3200/api/testcases/export.csv`

## Railway

Railway can deploy this repo directly from GitHub. Use the repo root and this start command:

```bash
npm start
```

`qa-system/server.js` reads Railway's `PORT` env var automatically, so the UI and sample API run through one process and one port.

## Useful Commands

```bash
npm run eval
npm run qa:ui
npm run app
```

Main outputs:

- `testcase/generated/latest_writer_output.json`
- `testcase/generated/latest_writer_output.csv`
- `testcase/generated/testcases.json`
- `testcase/approved/approved_testcases.json`
- `evals/results/latest_summary.json`
