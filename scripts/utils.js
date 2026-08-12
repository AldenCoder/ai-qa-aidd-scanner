const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUN_DIR = process.env.RUN_DIR
  ? path.resolve(process.env.RUN_DIR)
  : path.join(ROOT, 'evals', 'results', 'manual-run');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractField(section, fieldName) {
  const re = new RegExp(`^${fieldName}:\\s*(.+)$`, 'mi');
  const match = section.match(re);
  return match ? match[1].trim() : null;
}

function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  ROOT,
  RUN_DIR,
  ensureDir,
  readText,
  writeJson,
  readJson,
  extractField,
  todayIso
};
