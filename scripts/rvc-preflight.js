#!/usr/bin/env node

const [major, minor, patch] = process.versions.node.split('.').map(Number);
const required = [22, 21, 0];
const current = [major, minor, patch];
const isSupported =
  current[0] > required[0] ||
  (current[0] === required[0] && current[1] > required[1]) ||
  (current[0] === required[0] &&
    current[1] === required[1] &&
    current[2] >= required[2]);

if (!isSupported) {
  console.error(
    `RVC gate requires Node.js >= ${required.join('.')} (repository pin: 22.21.0).`,
  );
  console.error(
    `Detected Node.js ${process.versions.node}. Install/use the version from .nvmrc before running yarn install or the validation gate.`,
  );
  process.exit(1);
}

console.log(
  `Node.js ${process.versions.node} satisfies the repository RVC gate requirement.`,
);
