'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { compileBytecode, executeBytecode, tokenize, Parser } = require('./runtime/standalone');
const ipcit = require('./runtime/ipcit');
const { paint } = require('./runtime/ansi');

const CANCEL = Symbol('cancel');

/**
 * A VS Code terminal that CIT programs run in. It draws each kind of output in its
 * own color (errorln = red, warnln = yellow) and reads input("...") straight from
 * the keyboard, with echo and backspace, so no pop-up input box is needed.
 */
class CitTerminal {
  constructor(name, onClosed) {
    this.closed = false;
    this.opened = false;
    this.cancelled = false;
    this.running = null;
    this.pending = null;
    this.buffer = '';
    this.queue = [];
    this.onClosed = onClosed;
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.terminal = vscode.window.createTerminal({
      name,
      pty: {
        onDidWrite: this.writeEmitter.event,
        onDidClose: this.closeEmitter.event,
        open: () => { this.opened = true; this.queue.splice(0).forEach(t => this.writeEmitter.fire(t)); },
        close: () => this.dispose(),
        handleInput: data => this.handleInput(data)
      }
    });
  }

  show() { this.terminal.show(true); }
  clear() { this.write('\x1b[2J\x1b[3J\x1b[H'); }
  write(text) { if (this.opened) this.writeEmitter.fire(text); else this.queue.push(text); }
  writeLine(text, kind = 'out') { this.write(paint(kind, String(text).replace(/\r?\n/g, '\r\n')) + '\r\n'); }

  // Prints the prompt, then waits for a line typed into the terminal.
  readLine(prompt = '') {
    if (this.cancelled || this.closed) return Promise.reject(CANCEL);
    this.write(prompt);
    this.buffer = '';
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
  }

  handleInput(data) {
    if (data.startsWith('\x1b')) return;               // arrow keys etc. are ignored
    for (const ch of data) {
      if (ch === '\x03') { this.interrupt(); return; } // Ctrl+C
      if (!this.pending) continue;                     // typing while nothing is asking for input
      if (ch === '\r' || ch === '\n') {
        const p = this.pending; const line = this.buffer;
        this.pending = null; this.buffer = '';
        this.write('\r\n'); p.resolve(line);
      } else if (ch === '\x7f' || ch === '\b') {
        if (this.buffer.length) { this.buffer = [...this.buffer].slice(0, -1).join(''); this.write('\b \b'); }
      } else if (ch >= ' ') {
        this.buffer += ch; this.write(ch);
      }
    }
  }

  interrupt() {
    this.write('^C\r\n');
    this.cancelled = true;
    if (this.pending) { const p = this.pending; this.pending = null; this.buffer = ''; p.reject(CANCEL); }
  }

  // Stops whatever is running and waits for it, so the terminal can be reused.
  async stop() {
    this.cancelled = true;
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(CANCEL); }
    if (this.running) { try { await this.running; } catch { /* already reported */ } }
    this.running = null; this.cancelled = false;
  }

  close() { if (!this.closed) { this.closeEmitter.fire(0); this.dispose(); } }

  dispose() {
    if (this.closed) return;
    this.closed = true; this.cancelled = true;
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(CANCEL); }
    if (this.onClosed) this.onClosed();
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel('CIT Output');
  const diagnostics = vscode.languages.createDiagnosticCollection('cit');
  context.subscriptions.push(output, diagnostics);

  // `cit` and `ipcit` become available in terminals opened from VS Code.
  const binDir = path.join(context.extensionPath, 'bin');
  if (process.platform !== 'win32') {
    for (const f of ['cit', 'cit.js', 'ipcit', 'ipcit.js']) { try { fs.chmodSync(path.join(binDir, f), 0o755); } catch { /* ignore */ } }
  }
  try {
    context.environmentVariableCollection.description = 'Adds the cit and ipcit commands to PATH';
    context.environmentVariableCollection.prepend('PATH', binDir + path.delimiter);
  } catch { /* older VS Code */ }

  let runTerminal = null;
  let ipcitTerminal = null;

  const editorForCIT = () => {
    const e = vscode.window.activeTextEditor;
    if (!e || e.document.languageId !== 'cit') {
      vscode.window.showWarningMessage('Open a .cit or .ct file first.');
      return null;
    }
    return e;
  };

  const runCmd = vscode.commands.registerCommand('cit.runFile', async () => {
    const e = editorForCIT(); if (!e) return;
    if (e.document.isDirty) await e.document.save();
    diagnostics.delete(e.document.uri);

    if (!runTerminal || runTerminal.closed) runTerminal = new CitTerminal('CIT', () => { runTerminal = null; });
    const term = runTerminal;
    await term.stop();
    term.clear(); term.show();

    const fsPath = e.document.uri.scheme === 'file' ? e.document.uri.fsPath : null;
    term.writeLine(`> cit ${fsPath ? path.basename(fsPath) : e.document.fileName}`, 'dim');

    term.running = (async () => {
      try {
        // Compile to bundled bytecode and run on the bundled VM; no external compiler.
        const bytecode = compileBytecode(e.document.getText());
        await executeBytecode(
          bytecode,
          (line, kind) => term.writeLine(line, kind),   // kind: out | warn | error -> own color
          prompt => term.readLine(prompt),               // input() is typed in the terminal
          {
            baseDir: fsPath ? path.dirname(fsPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null),
            resolveModule: ipcit.resolveModule,
            isCancelled: () => term.cancelled
          }
        );
        term.writeLine('\n[CIT] Finished successfully (bundled CIT VM).', 'ok');
      } catch (err) {
        if (err === CANCEL || term.cancelled) { if (!term.closed) term.writeLine('[CIT] Stopped.', 'warn'); return; }
        report(err, e.document, line => term.writeLine(line, 'error'), diagnostics);
      }
    })();
  });

  const compileCmd = vscode.commands.registerCommand('cit.compileBytecode', async () => {
    const e = editorForCIT(); if (!e) return;
    if (e.document.isDirty) await e.document.save();
    output.clear(); output.show(true); diagnostics.delete(e.document.uri);
    try {
      const bytecode = compileBytecode(e.document.getText());
      const outPath = path.join(path.dirname(e.document.uri.fsPath), path.basename(e.document.uri.fsPath, path.extname(e.document.uri.fsPath)) + '.citbc.json');
      fs.writeFileSync(outPath, JSON.stringify(bytecode), 'utf8');
      output.appendLine(`[CIT] Bytecode written to ${outPath}`);
      output.appendLine('[CIT] This is portable CIT VM bytecode, not a native OS executable.');
      vscode.window.showInformationMessage('CIT bytecode compiled successfully.');
    } catch (err) { report(err, e.document, l => output.appendLine(l), diagnostics); }
  });

  const checkCmd = vscode.commands.registerCommand('cit.checkFile', async () => {
    const e = editorForCIT(); if (!e) return;
    try {
      new Parser(tokenize(e.document.getText())).parse();
      diagnostics.delete(e.document.uri);
      vscode.window.showInformationMessage('CIT syntax check passed.');
    } catch (err) { report(err, e.document, l => output.appendLine(l), diagnostics); }
  });

  // An interactive ipcit prompt inside a VS Code terminal (needs no Node install).
  const ipcitCmd = vscode.commands.registerCommand('cit.openIpcit', () => {
    if (ipcitTerminal && !ipcitTerminal.closed) { ipcitTerminal.show(); return; }
    const term = ipcitTerminal = new CitTerminal('ipcit', () => { ipcitTerminal = null; });
    term.show();
    term.running = ipcitShell(term);
  });

  context.subscriptions.push(runCmd, compileCmd, checkCmd, ipcitCmd, {
    dispose: () => { if (runTerminal) runTerminal.close(); if (ipcitTerminal) ipcitTerminal.close(); }
  });
}

function projectDir() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder) return folder;
  const doc = vscode.window.activeTextEditor?.document;
  if (doc && doc.uri.scheme === 'file') return path.dirname(doc.uri.fsPath);
  return os.homedir();
}

function splitArgs(line) {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

async function ipcitShell(term) {
  term.writeLine(`ipcit ${ipcit.VERSION} - the CIT package manager`, 'ok');
  term.writeLine("Type 'help' to see commands, 'exit' to close.", 'dim');
  term.writeLine(`Project folder: ${projectDir()}`, 'dim');
  while (!term.closed) {
    let line;
    try { line = await term.readLine(paint('ok', 'ipcit> ')); }
    catch (err) { if (term.closed) return; term.cancelled = false; continue; } // Ctrl+C just clears the line
    const args = splitArgs(line.trim());
    if (args[0] === 'ipcit') args.shift();
    if (!args.length) continue;
    if (args[0] === 'exit' || args[0] === 'quit') { term.close(); return; }
    if (args[0] === 'clear' || args[0] === 'cls') { term.clear(); continue; }
    ipcit.execute(args, { cwd: projectDir(), log: (kind, msg) => term.writeLine(msg, kind) });
  }
}

function report(err, document, write, diagnostics) {
  const line = Number.isInteger(err.line) ? err.line : 1;
  const column = Number.isInteger(err.column) ? err.column : 1;
  write(`[CIT Error] Line ${line}, column ${column}: ${err.message}`);
  const start = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
  const diagnostic = new vscode.Diagnostic(new vscode.Range(start, start.translate(0, 1)), err.message, vscode.DiagnosticSeverity.Error);
  diagnostic.source = 'CIT'; diagnostics.set(document.uri, [diagnostic]);
  vscode.window.showErrorMessage(`CIT: ${err.message} (line ${line})`);
}
function deactivate() {}
module.exports = { activate, deactivate };
