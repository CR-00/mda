#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

const dataDir = path.join(process.cwd(), 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

console.log(`Uploading ${files.length} files...`);

for (const filename of files) {
  const content = fs.readFileSync(path.join(dataDir, filename), 'utf8');
  await put(filename, content, {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
  console.log(`  ✓ ${filename}`);
}

console.log('Done.');
