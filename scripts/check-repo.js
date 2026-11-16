#!/usr/bin/env node
/*
 * Copyright 2026 Plataine Inc
 * Licensed under the Apache License, Version 2.0. See the LICENSE file.
 */

/**
 * Checks that the repository contains nothing that must stay out of it:
 *
 *   - addresses of Plataine environments (only the public website is allowed)
 *   - credentials
 *
 * Exits with status 1 and a list of findings when a rule is broken.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'dist', 'node_modules']);
const SKIP_FILES = new Set(['LICENSE', path.join('scripts', 'check-repo.js')]);
const ALLOWED_HOSTS = new Set(['www.plataine.com']);

const RULES = [
  {
    name: 'Plataine environment address',
    pattern: /\b[a-z0-9][a-z0-9.-]*\.plataine\.com\b/gi,
    allow: (match) => ALLOWED_HOSTS.has(match.toLowerCase()),
  },
  { name: 'cloud provider address', pattern: /\b[\w.-]+\.amazonaws\.com\b/gi },
  { name: 'IP address', pattern: /\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b/g },
  {
    name: 'credential',
    pattern: /\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*['"][^'"${}\s]{6,}['"]/gi,
    skip: (file) => file.startsWith(`test${path.sep}`),
  },
];

function listFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...listFiles(path.join(dir, entry.name)));
    } else if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const findings = [];
for (const file of listFiles(root)) {
  const relative = path.relative(root, file);
  if (SKIP_FILES.has(relative)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.skip && rule.skip(relative)) continue;
      for (const match of line.matchAll(rule.pattern)) {
        if (rule.allow && rule.allow(match[0])) continue;
        findings.push(`${relative}:${index + 1}  ${rule.name}: ${match[0]}`);
      }
    }
  });
}

if (findings.length) {
  console.error(`Repository check failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log('Repository check passed.');
