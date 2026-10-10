'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'release', '.git']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(absolute);
    }
  }
}

walk(root);

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

const requiredFiles = [
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/renderer.js',
  'src/newtab/index.html',
  'src/newtab/newtab.css',
  'src/preload.js',
  'src/main/main.js'
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) {
    throw new Error(`Missing required app file: ${relative}`);
  }
}

process.stdout.write(`Checked ${files.length} JavaScript files and ${requiredFiles.length} app resources.\n`);
