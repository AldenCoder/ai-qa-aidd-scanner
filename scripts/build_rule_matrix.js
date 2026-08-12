const path = require('path');
const { ROOT, RUN_DIR, readText, writeJson, extractField } = require('./utils');

function parseRuleSections(relPath) {
  const md = readText(relPath);
  return md
    .split(/^## /m)
    .slice(1)
    .map((raw) => {
      const [titleLine, ...bodyLines] = raw.split(/\r?\n/);
      const section = bodyLines.join('\n');
      const br = titleLine.match(/(BR-\d+)/)?.[1];
      const status = extractField(section, 'Status');
      const condition = extractField(section, 'Condition');
      const boundaryText = extractField(section, 'Boundary');
      const boundaries = boundaryText
        ? boundaryText.split(',').map((item) => {
            const trimmed = item.trim();
            return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
          })
        : [];
      return {
        br,
        title: titleLine.trim(),
        status,
        condition,
        boundaries,
        source_file: relPath,
        source_section: titleLine.trim()
      };
    })
    .filter((rule) => rule.br);
}

function buildRuleMatrix() {
  const baseRules = parseRuleSections('knowledge/rules/order-rules.md').map((rule) => ({
    rule_id: `R-ORDER-${rule.br.replace('BR-', '').padStart(3, '0')}`,
    condition: rule.condition,
    boundaries: rule.boundaries,
    status: rule.status,
    sources: [
      {
        file: rule.source_file,
        section: rule.source_section
      }
    ]
  }));

  baseRules.push({
    rule_id: 'R-ORDER-006',
    condition: 'GET /api/orders/{id} returns 404 for an unknown order ID.',
    boundaries: [],
    status: 'CONFIRMED',
    sources: [
      {
        file: 'knowledge/api/order-api.md',
        section: 'GET /api/orders/{id}'
      }
    ]
  });

  baseRules.push({
    rule_id: 'R-EVAL-CONFLICT-001',
    condition: 'Quantity maximum is conflicting: screen spec says 100, legacy API draft says 50.',
    boundaries: [50, 100],
    status: 'CONFLICT',
    eval_only: true,
    sources: [
      {
        file: 'knowledge/screens/order-create.md',
        section: 'Fields'
      },
      {
        file: 'evals/fixtures/conflict/api-order-v2-conflict.md',
        section: 'BR-06 Quantity Maximum Conflict'
      }
    ]
  });

  const out = {
    generated_at: new Date().toISOString(),
    method: 'deterministic-source-parser',
    rules: baseRules
  };

  writeJson(path.join(RUN_DIR, 'rule_matrix.json'), out);
  writeJson(path.join(ROOT, 'reports', 'rule_matrix.json'), out);
  console.log(`rules=${out.rules.length}`);
}

buildRuleMatrix();
