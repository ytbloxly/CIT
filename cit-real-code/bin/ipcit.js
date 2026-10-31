#!/usr/bin/env node
'use strict';
// ipcit — the CIT package manager. See runtime/ipcit.js.
const { execute } = require('../runtime/ipcit');
const { paint } = require('../runtime/ansi');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
process.exitCode = execute(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (kind, msg) => (kind === 'error' ? console.error : console.log)(paint(kind, msg, color))
});
