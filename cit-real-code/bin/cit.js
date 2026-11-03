#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { compileBytecode, executeBytecode, CITError } = require('../runtime/standalone');
const { resolveModule } = require('../runtime/ipcit');
const { paint } = require('../runtime/ansi');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const queue = [], waiters = [];
let closed = false, buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.search(/\r?\n/)) >= 0) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(buffer[i] === '\r' ? i + 2 : i + 1);
    const waiter = waiters.shift();
    if (waiter) waiter(line); else queue.push(line);
  }
});
process.stdin.on('end', () => {
  closed = true;
  if (buffer) { const waiter = waiters.shift(); if (waiter) waiter(buffer); else queue.push(buffer); buffer = ''; }
  waiters.splice(0).forEach(waiter => waiter(''));
});
process.stdin.pause();

function input(prompt) {
  process.stdout.write(prompt);
  if (queue.length) return Promise.resolve(queue.shift());
  if (closed) return Promise.resolve('');
  process.stdin.resume();
  return new Promise(resolve => waiters.push(line => {
    if (!waiters.length) process.stdin.pause();
    resolve(line);
  }));
}

async function runFile(file) {
  if (!fs.existsSync(file)) {
    console.error(paint('error', `[CIT] File not found: ${file}`, color));
    return 1;
  }
  const abs = path.resolve(file);
  let program;
  try { program = compileBytecode(fs.readFileSync(abs, 'utf8')); }
  catch (err) {
    if (err instanceof CITError) console.error(paint('error', `[CIT Compile Error] Line ${err.line}, column ${err.column}: ${err.message}`, color));
    else console.error(paint('error', `[CIT] ${err.stack || err}`, color));
    return 1;
  }
  try {
    await executeBytecode(program,
      (line, kind) => {
        if (kind === 'print') process.stdout.write(line);
        else console.log(paint(kind, line, color));
      },
      input,
      { baseDir: path.dirname(abs), resolveModule }
    );
    return 0;
  } catch (err) {
    if (err instanceof CITError) console.error(paint('error', `[CIT Error] Line ${err.line}, column ${err.column}: ${err.message}`, color));
    else console.error(paint('error', `[CIT] ${err.stack || err}`, color));
    return 1;
  }
}

function createFile(args) {
  const nameIndex = args.indexOf('--nm');
  const name = nameIndex >= 0 ? args[nameIndex + 1] : null;
  if (!name || name.startsWith('--')) {
    console.error('Usage: cit --crt file --nm <name.cit>');
    return 2;
  }
  try {
    fs.writeFileSync(path.resolve(name), '', { flag: 'wx' });
    console.log(`[CIT] Created ${name}`);
    return 0;
  } catch (err) {
    console.error(paint('error', `[CIT] Cannot create '${name}': ${err.message}`, color));
    return 1;
  }
}

function deleteFile(name) {
  if (!name) { console.error('Usage: cit --dlt <name.cit>'); return 2; }
  try {
    const file = path.resolve(name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      console.error(paint('error', `[CIT] File not found: ${name}`, color));
      return 1;
    }
    fs.unlinkSync(file);
    console.log(`[CIT] Deleted ${name}`);
    return 0;
  } catch (err) {
    console.error(paint('error', `[CIT] Cannot delete '${name}': ${err.message}`, color));
    return 1;
  }
}

function splitArgs(line) {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3]);
}

async function terminal() {
  console.log('CIT terminal — type help for commands, exit to close.');
  let rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const prompt = () => new Promise(resolve => rl.question(paint('ok', 'cit> ', color), resolve));
  for (;;) {
    const line = await prompt();
    const args = splitArgs(line.trim());
    if (args[0] === 'exit' || args[0] === 'quit') { rl.close(); break; }
    if (args[0] === 'clear' || args[0] === 'cls') console.clear();
    else if (args[0] === 'help') console.log('cit --crt file --nm <name.cit> | cit --enter <name.cit> | cit --dlt <name.cit> | exit');
    else if (args[0] === '--crt') createFile(args);
    else if (args[0] === '--dlt') deleteFile(args[1]);
    else if (args[0] === '--enter') {
      rl.close();
      queue.length = 0;
      await runFile(args[1]);
      queue.length = 0;
      rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    }
    else if (args[0]) console.error(paint('error', `Unknown command: ${args.join(' ')}`, color));
  }
  return 0;
}

async function main(args) {
  if (args[0] === '--open' && args[1] === 'trm') return terminal();
  if (args[0] === '--crt') return createFile(args);
  if (args[0] === '--dlt') return deleteFile(args[1]);
  if (args[0] === '--enter') return runFile(args[1]);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: cit <file.cit> | cit --open trm | cit --crt file --nm <name.cit> | cit --enter <name.cit> | cit --dlt <name.cit>');
    return args.length ? 0 : 1;
  }
  return runFile(args[0]);
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => {
  console.error(paint('error', `[CIT] ${err.stack || err}`, color));
  process.exitCode = 1;
});
