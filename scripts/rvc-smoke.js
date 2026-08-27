#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);

if (
  !packageJson.dependencies ||
  !packageJson.dependencies['onnxruntime-react-native']
) {
  throw new Error(
    'onnxruntime-react-native must remain declared for the optional offline adapter.',
  );
}

const forbiddenRoots = [
  path.join(root, 'android', 'app', 'src', 'main', 'assets'),
  path.join(root, 'ios', 'Resources'),
  path.join(root, 'src', 'assets'),
];
const weightExtensions = new Set(['.onnx', '.pth', '.pt', '.bin', '.index']);
const bundledWeights = [];

function scan(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(fullPath);
    else if (weightExtensions.has(path.extname(entry.name).toLowerCase()))
      bundledWeights.push(path.relative(root, fullPath));
  }
}

for (const directory of forbiddenRoots) scan(directory);
if (bundledWeights.length > 0) {
  throw new Error(
    `RVC model weights must not be bundled in the application: ${bundledWeights.join(', ')}`,
  );
}

console.log(
  'RVC structural smoke passed: optional ORT dependency is declared and no model weights are bundled.',
);
