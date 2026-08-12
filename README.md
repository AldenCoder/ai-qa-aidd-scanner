# AI QA Checklist Scanner

Small QA scanner/demo for checking a codebase or public GitHub repo against API, UI, security, and test-readiness checklists. It also includes a generated-test pipeline sample:

```text
knowledge -> rule matrix -> testcases -> validation -> QA review -> approved tests
-> Playwright automation -> execution -> evidence
```

## Run

```bash
npm install
npm start
```

Open:

- Dashboard: `http://127.0.0.1:3200`
- Demo app: `http://127.0.0.1:3200/demo`

## Railway

Railway can deploy this repo directly. The service uses one process and one port:

```bash
npm start
```

`qa-system/server.js` reads Railway's `PORT` env var automatically.

## Useful Commands

```bash
npm run eval
npm run qa:ui
npm run app
```

Main outputs:

- `evals/results/latest_summary.json`
- `testcase/approved/approved_testcases.json`
- `tests/generated/order.spec.js`
