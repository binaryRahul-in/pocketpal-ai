#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node ci/validate-model-manifest.js <manifest.json>');
  process.exit(2);
}
const errors = [];
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Manifest is not valid JSON: ${error.message}`);
  process.exit(1);
}
if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (!Array.isArray(manifest.models) || manifest.models.length === 0)
  errors.push('models must be a non-empty array');
for (const [index, model] of (manifest.models || []).entries()) {
  const prefix = `models[${index}]`;
  for (const field of ['id', 'format', 'path', 'sha256', 'license']) {
    if (typeof model[field] !== 'string' || model[field].length === 0)
      errors.push(`${prefix}.${field} is required`);
  }
  if (model.weights?.remote !== false)
    errors.push(`${prefix}.weights.remote must be false for CI fixtures`);
  if (model.weights?.sizeBytes !== 0)
    errors.push(`${prefix}.weights.sizeBytes must be 0`);
  if (
    model.path &&
    !fs.existsSync(
      path.resolve(path.dirname(manifestPath), '..', '..', model.path),
    )
  ) {
    errors.push(
      `${prefix}.path does not resolve to a checked-in fixture: ${model.path}`,
    );
  }
}
const report = {
  manifest: manifestPath,
  modelCount: manifest.models?.length || 0,
  errors,
  weightsDownloaded: false,
};
fs.writeFileSync(
  manifestPath.replace(/\.json$/, '.report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
if (errors.length) {
  console.error('Model manifest validation failed:');
  errors.forEach(error => console.error(`::error:: ${error}`));
  process.exit(1);
}
console.log(
  `Model manifest valid: ${report.modelCount} fixture model(s); no weights downloaded.`,
);
