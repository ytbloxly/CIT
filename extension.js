'use strict';
const vscode = require('vscode');
const { lint, closerFor, run } = require('./cit-core');

let applying = false;
let running = false;
let terminal = null;
let pty = null;
let panel = null;
let session = null;  // { fire } of the open UI preview
let current = null;  // state of the current run: { cancelled, wakers }

function refresh(doc, diagnostics) {
  if (doc.languageId !== 'cit') return;
  const list = lint(doc.getText()).map(p => {
    const d = new vscode.Diagnostic(
      new vscode.Range(p.line, p.start, p.line, p.end),
      p.message,
      p.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
    );
    d.source = 'CIT';
    return d;
  });
  diagnostics.set(doc.uri, list);
}

// ---------------------------------------------------------------- auto-closing end;
async function autoCloseEnd(e) {
  if (applying || e.document.languageId !== 'cit' || e.reason !== undefined) return;
  if (!vscode.workspace.getConfiguration('cit').get('autoCloseEnd', true)) return;
  if (e.contentChanges.length !== 1) return;
  const ch = e.contentChanges[0];
  if (!/^\r?\n[ \t]*$/.test(ch.text)) return; // only a plain Enter
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== e.document) return;

  const doc = e.document;
  const openerLine = ch.range.start.line;
  const newLine = openerLine + 1;
  if (newLine >= doc.lineCount || doc.lineAt(newLine).text.trim() !== '') return; // Enter was pressed mid-line
  const closer = closerFor(doc.getText(), openerLine);
  if (!closer) return;

  const base = /^\s*/.exec(doc.lineAt(openerLine).text)[0];
  const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const pos = doc.lineAt(newLine).range.end;

  applying = true;
  try {
    await editor.edit(b => b.insert(pos, eol + base + closer), { undoStopBefore: false, undoStopAfter: false });
    editor.selection = new vscode.Selection(pos, pos);
  } finally {
    applying = false;
  }
}

// ---------------------------------------------------------------- terminal (output AND input live here)
class CitPty {
  constructor() {
    this._write = new vscode.EventEmitter();
    this._close = new vscode.EventEmitter();
    this.onDidWrite = this._write.event;
    this.onDidClose = this._close.event;
    this.opened = false;
    this.pending = [];
    this.reader = null;      // resolve() of a pending console.input
    this.line = '';
    this.onInterrupt = null; // Ctrl+C
  }
  open() { this.opened = true; this.pending.forEach(s => this._write.fire(s)); this.pending = []; }
  close() { this.opened = false; this._cancelInput(); if (this.onInterrupt) this.onInterrupt(); }
  emit(s) { if (this.opened) this._write.fire(s); else this.pending.push(s); }
  print(text) { this.emit(String(text).replace(/\r?\n/g, '\r\n') + '\r\n'); }
  error(text) { this.emit('\x1b[31m' + String(text).replace(/\r?\n/g, '\r\n') + '\x1b[0m\r\n'); }
  info(text) { this.emit('\x1b[2m' + text + '\x1b[0m\r\n'); }
  clear() { this.emit('\x1b[2J\x1b[3J\x1b[H'); }
  readLine(prompt) {
    return new Promise(resolve => { this.emit(prompt); this.line = ''; this.reader = resolve; });
  }
  _cancelInput() {
    if (this.reader) { const r = this.reader; this.reader = null; this.line = ''; r(undefined); }
  }
  handleInput(data) {
    if (data.startsWith('\x1b')) return; // arrow keys etc.
    for (const ch of data) {
      if (ch === '\x03') { // Ctrl+C
        this.emit('^C\r\n');
        this._cancelInput();
        if (this.onInterrupt) this.onInterrupt();
      } else if (!this.reader) {
        continue;
      } else if (ch === '\r' || ch === '\n') {
        this.emit('\r\n');
        const r = this.reader; const v = this.line;
        this.reader = null; this.line = '';
        r(v);
      } else if (ch === '\x7f' || ch === '\b') {
        if (this.line.length) { this.line = this.line.slice(0, -1); this.emit('\b \b'); }
      } else if (ch >= ' ') {
        this.line += ch; this.emit(ch);
      }
    }
  }
}

function ensureTerminal() {
  if (!terminal || terminal.exitStatus !== undefined) {
    pty = new CitPty();
    terminal = vscode.window.createTerminal({ name: 'CIT', pty });
  }
  return pty;
}

// Ctrl+C: stop the running program and close the UI preview (without firing `closed`)
function interrupt() {
  if (current) { current.cancelled = true; [...current.wakers].forEach(w => w()); }
  if (session || panel) { closePanel(); if (pty) pty.info('> Stopped'); }
}

// ---------------------------------------------------------------- UI preview (webview)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function uiHtml(ui, nonce) {
  const body = ui.elements.map(el => {
    const isOut = el.kind === 'codeOutput';
    const a = [`data-name="${esc(el.name)}"`];
    if (el.attrs.id !== undefined) a.push(`id="${esc(el.attrs.id)}"`);
    const cls = [isOut ? 'cit-code-output' : null, el.attrs.class].filter(Boolean).join(' ');
    if (cls) a.push(`class="${esc(cls)}"`);
    if (el.kind === 'input') {
      a.push(`type="${esc(el.attrs.type || 'text')}"`, `placeholder="${esc(el.text)}"`, `value="${esc(el.value)}"`);
      if (el.attrs.minLength !== undefined) a.push(`minlength="${esc(el.attrs.minLength)}"`);
      if (el.attrs.maxLength !== undefined) a.push(`maxlength="${esc(el.attrs.maxLength)}"`);
      if (el.attrs.required !== undefined && el.attrs.required !== 'False') a.push('required');
      return `<input ${a.join(' ')}>`;
    }
    let content = el.text;
    if (isOut) {
      if (el.log.length) content = el.log.join('\n'); else a.push('data-placeholder="1"');
    }
    const tag = isOut ? 'pre' : el.kind;
    return `<${tag} ${a.join(' ')}>${esc(content)}</${tag}>`;
  }).join('\n');
  const rootId = ui.attrs.name !== undefined ? ui.attrs.name : ui.name;
  // ui.css only contains validated tokens (see compileStyleProp in cit-core.js)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 1em; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  input { display: block; margin: 6px 0; padding: 6px 8px; width: 16em; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 3px; font-size: 1em; }
  .cit-code-output { padding: 8px; min-height: 3em; max-height: 50vh; overflow: auto; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); font-family: var(--vscode-editor-font-family); white-space: pre-wrap; }
  .cit-code-output[data-placeholder] { opacity: .5; }
</style>
<style>
${ui.css || ''}
</style></head><body>
<div id="cit-app"><div id="${esc(rootId)}">
${body}
</div></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const find = name => document.querySelector('[data-name="' + CSS.escape(name) + '"]');
  const send = (el, event, value) => vscode.postMessage({ type: 'event', name: el.dataset.name, event, value });
  const named = e => e.target.closest && e.target.closest('[data-name]');
  document.addEventListener('click', e => {
    const el = named(e);
    if (!el) return;
    el.classList.add('cit-clicked'); // styled by  id.X.clicked() { ... };
    if (el.tagName !== 'INPUT') send(el, 'clicked');
  });
  document.addEventListener('mouseover', e => { // hover: the mouse entered the element
    const el = named(e);
    if (!el || el.contains(e.relatedTarget)) return;
    el.classList.remove('cit-hover-end');
    send(el, 'hover');
  });
  document.addEventListener('mouseout', e => { // hoverEnd: the mouse left the element
    const el = named(e);
    if (!el || el.contains(e.relatedTarget)) return;
    el.classList.add('cit-hover-end');
    send(el, 'hoverEnd');
  });
  document.addEventListener('mousedown', e => { const el = named(e); if (el) send(el, 'active'); });
  document.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT') send(e.target, 'focus'); });
  document.addEventListener('focusout', e => { if (e.target.tagName === 'INPUT') send(e.target, 'focusEnd'); });
  document.addEventListener('input', e => { if (e.target.tagName === 'INPUT') send(e.target, 'typed', e.target.value); });
  window.addEventListener('message', e => {
    const m = e.data, el = find(m.name);
    if (!el) return;
    if (m.type === 'text') {
      el.textContent = m.text;
      if (el.classList.contains('cit-code-output')) el.setAttribute('data-placeholder', '1');
    } else if (m.type === 'append') {
      if (el.hasAttribute('data-placeholder')) { el.textContent = ''; el.removeAttribute('data-placeholder'); }
      el.textContent += (el.textContent ? '\\n' : '') + m.text;
      el.scrollTop = el.scrollHeight;
    } else if (m.type === 'value') {
      el.value = m.value;
    }
  });
</script></body></html>`;
}

function closePanel() { // programmatic close: stops the program, does NOT fire `closed`
  if (session) { session.fire.cancel(); session = null; }
  if (panel) { const p = panel; panel = null; p.dispose(); }
}

function reportError(error) {
  pty.error(`[CIT error] line ${error.line + 1}: ${error.message}`);
}

function openPanel(ui, fire) {
  const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  const p = vscode.window.createWebviewPanel('citUi', ui.title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true });
  panel = p;
  session = { fire };
  p.webview.html = uiHtml(ui, nonce);
  p.webview.onDidReceiveMessage(async msg => {
    if (msg.type !== 'event') return;
    const res = await fire(msg.name, msg.event, msg.value);
    if (res.error) reportError(res.error);
  });
  p.onDidDispose(async () => {
    if (panel !== p) return; // closed by us
    panel = null;
    const s = session; session = null;
    if (s) {
      const res = await s.fire.close(); // runs  <root>.closed(func ...)  handlers
      if (res.error) reportError(res.error);
      s.fire.cancel();
    }
    pty.info('> UI closed');
  });
}

// ---------------------------------------------------------------- run command
async function runCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'cit') {
    vscode.window.showWarningMessage('Open a .cit file to run it.');
    return;
  }
  if (running) { vscode.window.showInformationMessage('A CIT program is already running (press Ctrl+C in the CIT terminal to stop it).'); return; }
  running = true;
  try {
    await editor.document.save();
    closePanel();
    const term = ensureTerminal();
    const state = { cancelled: false, wakers: new Set() };
    current = state;
    term.onInterrupt = interrupt;
    terminal.show(true);
    term.clear();
    term.info(`> Running ${editor.document.fileName.split(/[\\/]/).pop()}   (Ctrl+C to stop)`);

    const io = {
      write: line => term.print(line),
      input: async prompt => {
        terminal.show(false); // give the terminal the keyboard focus
        return term.readLine(prompt);
      },
      sleep: ms => new Promise(res => {
        const wake = () => { clearTimeout(t); state.wakers.delete(wake); res(); };
        const t = setTimeout(wake, ms);
        state.wakers.add(wake);
      }),
      isCancelled: () => state.cancelled,
      uiReady: (ui, fire) => openPanel(ui, fire),
      uiUpdate: (name, text) => { if (panel) panel.webview.postMessage({ type: 'text', name, text }); },
      uiOutput: (name, text) => { if (panel) panel.webview.postMessage({ type: 'append', name, text }); },
      uiValue: (name, value) => { if (panel) panel.webview.postMessage({ type: 'value', name, value }); }
    };
    const { exit, error, ui } = await run(editor.document.getText(), io);
    if (state.cancelled) {
      term.info('> Stopped');
    } else {
      if (error) { reportError(error); closePanel(); }
      term.info(`Finished: error.${exit}` + (ui && panel ? '  (UI stays open - close its tab to stop)' : ''));
    }
    vscode.window.setStatusBarMessage(`CIT: finished with error.${exit}`, 4000);
  } finally {
    running = false;
  }
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('cit');
  context.subscriptions.push(diagnostics);
  vscode.workspace.textDocuments.forEach(d => refresh(d, diagnostics));
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(d => refresh(d, diagnostics)),
    vscode.workspace.onDidChangeTextDocument(e => { refresh(e.document, diagnostics); autoCloseEnd(e); }),
    vscode.workspace.onDidCloseTextDocument(d => diagnostics.delete(d.uri)),
    vscode.window.onDidCloseTerminal(t => { if (t === terminal) { terminal = null; pty = null; } }),
    vscode.commands.registerCommand('cit.run', runCommand)
  );
  vscode.window.setStatusBarMessage('CIT extension is active', 3000);
}

function deactivate() { closePanel(); }
module.exports = { activate, deactivate };
