#!/usr/bin/env node
/*
 * Copyright 2026 Plataine Inc
 * Licensed under the Apache License, Version 2.0. See the LICENSE file.
 */

/**
 * Builds the two install files into dist/:
 *
 *   dist/plataine-ai-agents.mcpb         the Claude Desktop extension
 *   dist/plataine-ai-agents-plugin.zip   the Claude plugin
 *
 * Both are zip archives. The archives are written here, without external
 * tools, so the build gives the same result on Windows, macOS and Linux.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Lists every file under dir, as paths relative to dir with forward slashes.
function listFiles(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function zipDirectory(sourceDir, targetFile) {
  // A fixed timestamp (1 January 1980) keeps the archive identical between builds.
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021;
  const local = [];
  const central = [];
  let offset = 0;

  for (const name of listFiles(sourceDir)) {
    const data = fs.readFileSync(path.join(sourceDir, name));
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);            // version needed
    header.writeUInt16LE(0x0800, 6);        // UTF-8 names
    header.writeUInt16LE(8, 8);             // deflate
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBytes, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);             // version made by
    entry.writeUInt16LE(20, 6);             // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += header.length + nameBytes.length + compressed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const count = central.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(targetFile, Buffer.concat([...local, ...central, end]));
  return count;
}

fs.mkdirSync(dist, { recursive: true });
const targets = [
  ['claude/desktop-extension', 'plataine-ai-agents.mcpb'],
  ['claude/plugin', 'plataine-ai-agents-plugin.zip'],
];
for (const [source, file] of targets) {
  const count = zipDirectory(path.join(root, source), path.join(dist, file));
  console.log(`dist/${file}  (${count} files from ${source})`);
}
