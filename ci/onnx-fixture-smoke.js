#!/usr/bin/env node
const fs = require('fs');
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node ci/onnx-fixture-smoke.js <fixture.json>');
  process.exit(2);
}
const fixture = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const graph = fixture.graph || {};
const errors = [];
if (fixture.producerName !== 'pocketpal-ci-fixture')
  errors.push('fixture producerName is unexpected');
if (!Array.isArray(graph.inputs) || graph.inputs.length !== 1)
  errors.push('fixture must have one input');
if (
  !Array.isArray(graph.nodes) ||
  graph.nodes.length !== 1 ||
  graph.nodes[0].opType !== 'Add'
)
  errors.push('fixture must contain exactly one Add node');
if (!Array.isArray(graph.initializers) || graph.initializers.length !== 1)
  errors.push('fixture must have one initializer');
if (fixture.weights?.embedded !== true || fixture.weights?.sizeBytes !== 4)
  errors.push('fixture must contain only its 4-byte embedded bias');
const result = 0.5 + graph.initializers?.[0]?.data?.[0];
if (Math.abs(result - 0.75) > 1e-6)
  errors.push(`fixture evaluation expected 0.75, got ${result}`);
const reportPath = inputPath.replace(/\.json$/, '.report.json');
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      fixture: inputPath,
      graph: graph.name,
      result,
      weightsDownloaded: false,
      errors,
    },
    null,
    2,
  ) + '\n',
);
if (errors.length) {
  console.error('ONNX fixture smoke test failed:');
  errors.forEach(error => console.error(`::error:: ${error}`));
  process.exit(1);
}
console.log(
  `ONNX fixture smoke test passed: ${graph.name}; result=${result}; no weights downloaded.`,
);
