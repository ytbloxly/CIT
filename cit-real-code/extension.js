'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { compileBytecode, executeBytecode, tokenize, Parser } = require('./runtime/standalone');
const ipcit = require('./runtime/ipcit');
const { paint } = require('./runtime/ansi');
const { formatCit, FormatError } = require('./runtime/formatter');

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
  let windowIdleSince = vscode.window.state.focused ? null : Date.now();
  const idleListener = vscode.window.onDidChangeWindowState(state => {
    windowIdleSince = state.focused ? null : Date.now();
  });
  context.subscriptions.push(output, diagnostics, idleListener);

  const hoverProvider = vscode.languages.registerHoverProvider('cit', {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position);
      if (!range) return null;
      const details = CIT_HOVER[document.getText(range)];
      return details ? new vscode.Hover(new vscode.MarkdownString(details), range) : null;
    }
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider('cit', {
    provideDefinition(document, position) {
      const range = document.getWordRangeAtPosition(position);
      if (!range) return null;
      const name = document.getText(range);
      const declaration = new RegExp(`(?:\\b(?:static\\s+)?let\\s+(?:mut\\s+|enum\\s+)?[^=\\r\\n]*\\b|\\bconst\\s+[^=\\r\\n]*\\b|\\b(?:fn|class)\\s+|\\b(?:int|float|str|char|bool)\\s+|\\bfor\\s*\\(\\s*(?:let\\s+(?:mut\\s+)?)?)(${escapeRegExp(name)})\\b`, 'g');
      const source = document.getText();
      const matches = [];
      let match;
      while ((match = declaration.exec(source))) matches.push(match.index + match[0].lastIndexOf(name));
      if (!matches.length) return null;
      const offset = document.offsetAt(position);
      const preceding = matches.filter(index => index <= offset);
      const target = preceding.length ? preceding[preceding.length - 1] : matches[0];
      return new vscode.Location(document.uri, document.positionAt(target));
    }
  });
  context.subscriptions.push(hoverProvider, definitionProvider);

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
      // Step 1: compile. Syntax errors are found here, before anything runs.
      const name = fsPath ? path.basename(fsPath) : e.document.fileName;
      term.writeLine(`[CIT] Compiling ${name}...`, 'dim');
      const started = Date.now();
      let bytecode;
      try {
        bytecode = compileBytecode(e.document.getText());
      } catch (err) {
        report(err, e.document, line => term.writeLine(line, 'error'), diagnostics, 'Compile Error');
        term.writeLine('[CIT] Nothing was run because the code did not compile.', 'warn');
        return;
      }
      term.writeLine(`[CIT] Compiled in ${Date.now() - started} ms. Running...\n`, 'dim');

      // Step 2: run the compiled program on the bundled VM (no external compiler needed).
      try {
        await executeBytecode(
          bytecode,
          (line, kind) => kind === 'print'
            ? term.write(String(line).replace(/\r?\n/g, '\r\n'))
            : term.writeLine(line, kind),   // kind: out | warn | error -> own color
          prompt => term.readLine(prompt),               // input() is typed in the terminal
          {
            baseDir: fsPath ? path.dirname(fsPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null),
            resolveModule: ipcit.resolveModule,
            renderUI: (tree, title, styles) => renderCITUI(tree, title, styles),
            isUserIdle: () => windowIdleSince !== null,
            windowPrompt: async message => (await vscode.window.showInputBox({ prompt: message })) ?? null,
            windowAlert: message => vscode.window.showInformationMessage(message),
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

  // Format Document (Shift+Alt+F)
  const formatter = vscode.languages.registerDocumentFormattingEditProvider('cit', {
    provideDocumentFormattingEdits(document, options) {
      const text = document.getText();
      let formatted;
      try { formatted = formatCit(text, { tabSize: options.tabSize, insertSpaces: options.insertSpaces }); }
      catch (err) {
        vscode.window.showWarningMessage(`CIT format: ${err instanceof FormatError ? err.message : 'could not format this file.'}`);
        return [];
      }
      if (formatted === text) return [];
      const whole = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
      return [vscode.TextEdit.replace(whole, formatted)];
    }
  });

  // Opens the "Look 'n learn" guide that ships with the extension.
  const learnCmd = vscode.commands.registerCommand('cit.openLearn', async () => {
    const file = path.join(context.extensionPath, "Look 'n learn", 'README.md');
    if (!fs.existsSync(file)) { vscode.window.showWarningMessage("The Look 'n learn folder was not found."); return; }
    const uri = vscode.Uri.file(file);
    try { await vscode.commands.executeCommand('markdown.showPreview', uri); }
    catch { await vscode.window.showTextDocument(uri); }
  });

  context.subscriptions.push(runCmd, compileCmd, checkCmd, ipcitCmd, formatter, learnCmd, {
    dispose: () => { if (runTerminal) runTerminal.close(); if (ipcitTerminal) ipcitTerminal.close(); }
  });
}

const CIT_HOVER = {
  let: '`let` declares an immutable variable. Use `let mut` when it needs reassignment.',
  mut: 'Marks a variable or loop binding as mutable.',
  const: 'Declares a constant value that cannot be reassigned.',
  static: 'Declares a static value that is stored per function or class scope.',
  fn: 'Declares a function: `fn name(parameters) { ... }`.',
  class: 'Declares a class. A parent can be written as `class Child(Parent())`.',
  for: 'Loops support `for (let item in values)` and `for (let i, range(0, 10))`.',
  import: 'Imports a local CIT module, an ipcit package, or built-in `math` / `ui` modules.',
  temporal: 'Temporal lifetime suffixes are `<Nr>` (reads), `<Ns>` (seconds), or `<Nl>` (source lines). Seconds also support `offline` and `stopUse` modes.',
  tuple: 'Creates an immutable ordered tuple.',
  set: 'Creates a unique-value set.',
  guard: 'Runs an `else` block and exits early when its condition is false.',
  get: 'Declares a class property getter with `get fn property() { ... }`.',
  set: 'Declares a class property setter with `set fn property(value) { ... }`.',
  final: 'Prevents a class from being subclassed.',
  json: 'Built-in JSON module: `json.dumps`, `json.loads`, `json.dump`, and `json.load`.',
  time: 'Built-in time module for timestamps, local/UTC time values, and formatting.',
  ui: 'Built-in UI module for building HTML-style elements rendered in a VS Code webview.',
  'ui-style': 'Built-in UI styling module. Connect a named style from a UI app function.',
  longString: 'Converts a value to text. Strings are unbounded unless an `sN` width is explicitly declared.',
  longNumber: 'Converts a number or numeric string to the runtime number type; it is not arbitrary precision.',
  printf: 'Prints a `%s`, `%d`, `%i`, `%f` formatted string.',
  exchange: 'Replaces a mutable variable and returns its previous value.',
  enumerate: 'Returns `[index, value]` pairs from a list.',
  zip: 'Combines lists into pairs up to the length of the shortest list.',
  square: 'Returns the square of a number.',
  task: '`task.wait(seconds)` pauses the current program.',
  private: 'Restricts a class field to methods declared in that class.',
  protected: 'Restricts a class field to methods in its class and subclasses.',
  raise: 'Raises a typed error. Handle it with `except ErrorType` or a general `catch`.',
  finally: 'Runs a cleanup block whether a `try` block succeeds or raises.'
};

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function renderCITUI(tree, title, styles = []) {
  const panel = vscode.window.createWebviewPanel('cit.preview', title || 'CIT App', vscode.ViewColumn.Beside, {
    enableScripts: false,
    localResourceRoots: []
  });
  const allowed = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'p', 'button', 'div', 'select', 'option', 'input', 'section']);
  const voidTags = new Set(['input']);
  const lengthProperties = new Set(['padding', 'margin', 'fontSize', 'height', 'width', 'top', 'bottom', 'left', 'right', 'borderRadius', 'lineHeight', 'letterSpacing', 'wordSpacing']);
  const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const css = styles.map(rule => {
    if (typeof rule.selector !== 'string' || !/^[A-Za-z0-9_.*# ,>:+-]+$/.test(rule.selector)) return '';
    const declarations = Object.entries(rule.properties).flatMap(([name, value]) => {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || value === null || value === undefined) return [];
      let text = String(value);
      if (typeof value === 'number' && lengthProperties.has(name) && value !== 0) text += 'px';
      if (/[{}<>]|url\s*\(/i.test(text)) return [];
      const property = name.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
      return [`${property}:${text}`];
    });
    return declarations.length ? `${rule.selector}{${declarations.join(';')}}` : '';
  }).join('\n');
  const render = value => {
    if (Array.isArray(value)) return value.map(render).join('');
    if (value && value.__ui) {
      const tag = value.tag === 'title' ? 'h1' : value.tag === 'tile' ? 'section' : value.tag === 'slider' ? 'input' : value.tag;
      if (!allowed.has(tag)) return '';
      const attrs = { ...value.attrs };
      if (value.tag === 'slider') attrs.type = 'range';
      const renderedAttrs = Object.entries(attrs).flatMap(([name, attribute]) => {
        if (!/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name) || /^on/i.test(name) || attribute === false || attribute === null || attribute === undefined) return [];
        if (name === 'href' && /^\s*javascript:/i.test(String(attribute))) return [];
        return [attribute === true ? ` ${name}=""` : ` ${name}="${escapeHTML(attribute)}"`];
      }).join('');
      const children = value.children.map(render).join('');
      return voidTags.has(tag) ? `<${tag}${renderedAttrs}>` : `<${tag}${renderedAttrs}>${children}</${tag}>`;
    }
    return escapeHTML(value === null || value === undefined ? '' : value);
  };
  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHTML(title || 'CIT App')}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#24292f;background:#fff}h1,h2,h3,h4,h5,h6,header{line-height:1.2;color:#111827}p{margin:1em 0}button,input,select{font:inherit}button{padding:.5em 1em;cursor:pointer}${css}</style></head><body>${render(tree)}</body></html>`;
  return null;
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

function report(err, document, write, diagnostics, label = 'Error') {
  const line = Number.isInteger(err.line) ? err.line : 1;
  const column = Number.isInteger(err.column) ? err.column : 1;
  write(`[CIT ${label}] Line ${line}, column ${column}: ${err.message}`);
  const start = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
  const diagnostic = new vscode.Diagnostic(new vscode.Range(start, start.translate(0, 1)), err.message, vscode.DiagnosticSeverity.Error);
  diagnostic.source = 'CIT'; diagnostics.set(document.uri, [diagnostic]);
  vscode.window.showErrorMessage(`CIT: ${err.message} (line ${line})`);
}
function deactivate() {}
module.exports = { activate, deactivate };
