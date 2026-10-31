#!/usr/bin/env node
'use strict';
// cit <file.cit> — run a CIT program in the terminal. errorln/warnln are coloured,
// and input("...") reads from the terminal.
const fs = require('fs');
const path = require('path');
const { run, CITError } = require('../runtime/standalone');
const { resolveModule } = require('../runtime/ipcit');
const { paint } = require('../runtime/ansi');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const file = process.argv[2];
if (!file || file === '--help' || file === '-h') {
  console.log('Usage: cit <file.cit>');
  process.exit(file ? 0 : 1);
}
if (!fs.existsSync(file)) { console.error(paint('error', `[CIT] File not found: ${file}`, color)); process.exit(1); }

// Line reader that works for both an interactive terminal and piped input.
const queue = []; const waiters = []; let closed = false; let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.search(/\r?\n/)) >= 0) {
    const line = buffer.slice(0, i); buffer = buffer.slice(buffer[i] === '\r' ? i + 2 : i + 1);
    const w = waiters.shift(); if (w) w(line); else queue.push(line);
  }
});
process.stdin.on('end', () => { closed = true; if (buffer) { const w = waiters.shift(); if (w) w(buffer); else queue.push(buffer); buffer = ''; } waiters.splice(0).forEach(w => w('')); });
process.stdin.pause();

function input(prompt) {
  process.stdout.write(prompt);
  if (queue.length) return Promise.resolve(queue.shift());
  if (closed) return Promise.resolve('');
  process.stdin.resume();
  return new Promise(resolve => waiters.push(line => { if (!waiters.length) process.stdin.pause(); resolve(line); }));
}

const abs = path.resolve(file);
run(fs.readFileSync(abs, 'utf8'),
  (line, kind) => console.log(paint(kind, line, color)),
  input,
  { baseDir: path.dirname(abs), resolveModule }
).then(() => process.exit(0), err => {
  if (err instanceof CITError) console.error(paint('error', `[CIT Error] Line ${err.line}, column ${err.column}: ${err.message}`, color));
  else console.error(paint('error', `[CIT] ${err.stack || err}`, color));
  process.exit(1);
});
