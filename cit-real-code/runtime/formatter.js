'use strict';
/*
 * CIT code formatter.
 *
 *   formatCit(text, { tabSize: 4, insertSpaces: true }) -> formatted text
 *
 * What it does:
 *   - re-indents lines by how many { ( [ are open (4 spaces per level by default)
 *   - one space around operators, after commas and colons, none inside ( ) and [ ]
 *   - `if (`, `while (`, `for (`, `switch (`, `catch (` get a space; calls like `f(x)` do not
 *   - trims trailing spaces, collapses runs of blank lines to one, ends the file with one newline
 *
 * What it never does: join or split lines, touch the inside of strings, multi-line strings or
 * comments, or change the program. Before returning, the formatted text is tokenized again and
 * compared with the original; if anything differs, formatting is refused.
 */

const { tokenize } = require('./standalone');

const NON_OPERAND_WORDS = new Set([
  'return', 'case', 'in', 'defer', 'throw', 'else', 'do', 'try', 'let', 'mut', 'import', 'as',
  'if', 'elseif', 'while', 'for', 'switch', 'catch', 'except', 'finally', 'raise', 'with',
  'enum', 'private', 'protected', 'fn', 'class'
]);
const CONTROL_BEFORE_PAREN = new Set(['if', 'elseif', 'while', 'for', 'switch', 'catch', 'except', 'return', 'case', 'in', 'defer', 'throw', 'raise']);
const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '&&', '||', '**', '//', '+=', '-=', '*=', '/=', '%=', '++', '--', '=>'];

class FormatError extends Error {}

// index of the closing """ at or after `from`, or -1
function findTripleEnd(line, from) {
  for (let j = from; j < line.length; j++) {
    if (line[j] === '\\') { j++; continue; }
    if (line.startsWith('"""', j)) return j;
  }
  return -1;
}

// Splits one line into tokens. `mode` says whether the line starts inside a /* */ comment or a """ string.
// Token types: word, str, comment, bcomment, op, punc, raw (verbatim text continued from a previous line).
function lexLine(line, mode) {
  const toks = [];
  let i = 0, gap = '';
  const push = (type, text) => { toks.push({ type, text, gap }); gap = ''; };

  if (mode === 'block') {
    const k = line.indexOf('*/');
    if (k < 0) { push('raw', line); return { toks, mode }; }
    push('raw', line.slice(0, k + 2)); i = k + 2; mode = null;
  } else if (mode === 'triple') {
    const k = findTripleEnd(line, 0);
    if (k < 0) { push('raw', line); return { toks, mode }; }
    push('raw', line.slice(0, k + 3)); i = k + 3; mode = null;
  }

  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { gap += ch; i++; continue; }
    if (ch === '#') { push('comment', line.slice(i).replace(/\s+$/, '')); i = line.length; break; }
    if (ch === '/' && line[i + 1] === '*') {
      const k = line.indexOf('*/', i + 2);
      if (k < 0) { push('bcomment', line.slice(i)); mode = 'block'; i = line.length; break; }
      push('bcomment', line.slice(i, k + 2)); i = k + 2; continue;
    }
    if (line.startsWith('"""', i) || line.startsWith('$"""', i)) {
      const k = findTripleEnd(line, ch === '$' ? i + 4 : i + 3);
      if (k < 0) { push('str', line.slice(i)); mode = 'triple'; i = line.length; break; }
      push('str', line.slice(i, k + 3)); i = k + 3; continue;
    }
    if (ch === '"' || ch === "'" || (ch === '$' && line[i + 1] === '"')) {
      const q = ch === '$' ? '"' : ch;
      let j = ch === '$' ? i + 2 : i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
      j = Math.min(j + 1, line.length);
      push('str', line.slice(i, j)); i = j; continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (/[0-9]/.test(line[j] || '')) j++;
      if (line[j] === '.' && /[0-9]/.test(line[j + 1] || '')) { j++; while (/[0-9]/.test(line[j] || '')) j++; }
      push('word', line.slice(i, j)); i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (/[A-Za-z0-9_]/.test(line[j] || '')) j++;
      push('word', line.slice(i, j)); i = j; continue;
    }
    const three = line.slice(i, i + 3);
    if (three === '**=' || three === '//=') { push('op', three); i += 3; continue; }
    const two = line.slice(i, i + 2);
    if (two === '?.') { push('punc', '?.'); i += 2; continue; }
    if (TWO_CHAR_OPS.includes(two)) { push('op', two); i += 2; continue; }
    if ('+-*/%<>=!'.includes(ch)) { push('op', ch); i++; continue; }
    if ('(){}[];,.:$@'.includes(ch)) { push('punc', ch); i++; continue; }
    push('op', ch); i++;       // anything else: keep as it is
  }
  return { toks, mode };
}

const isPunc = (t, ...v) => t && t.type === 'punc' && v.includes(t.text);

// can an operator after this token only be a binary operator?
function operandEnd(t) {
  if (!t) return false;
  if (t.type === 'str' || t.type === 'raw') return true;
  if (t.type === 'word') return !NON_OPERAND_WORDS.has(t.text);
  if (t.type === 'punc') return t.text === ')' || t.text === ']';
  if (t.type === 'op') return !!t.postfix;
  return false;
}

// marks prefix/postfix/unary operators
function classify(toks) {
  let prev = null;
  for (const t of toks) {
    if (t.type === 'bcomment') continue;
    if (t.type === 'op') {
      const pe = operandEnd(prev);
      if (t.text === '++' || t.text === '--') { if (pe) t.postfix = true; else t.unary = true; }
      else if (t.text === '!') t.unary = true;
      else if ((t.text === '-' || t.text === '+') && !pe) t.unary = true;
    }
    prev = t;
  }
}

function needSpace(p, c) {
  if (p.type === 'bcomment' || c.type === 'bcomment') return true;
  if (p.temporal && c.temporal) return false;
  if (isPunc(p, '(', '[')) return false;
  if (isPunc(c, ')', ']', ',', ';', '.', '?.', ':')) return false;
  if (isPunc(p, ',', ';', ':')) return true;
  if (isPunc(p, '.', '?.')) return false;
  if (isPunc(p, '@') || isPunc(c, '@')) return false;
  if (isPunc(c, '{')) return true;
  if (isPunc(p, '{') && isPunc(c, '}')) return c.gap !== '';     // {} stays {} and { } stays { }
  if (isPunc(p, '{')) return p.kind === 'block' ? true : c.gap !== '';   // blocks get { x }; dictionaries keep {x} or { x }
  if (isPunc(c, '}')) return c.kind === 'block' ? true : c.gap !== '';
  if (isPunc(c, '(')) {
    if (p.type === 'op' && p.unary) return false;
    if (p.type === 'word' && p.text === 'fn') return false;
    if (p.type === 'word' && CONTROL_BEFORE_PAREN.has(p.text)) return true;
    return !operandEnd(p);
  }
  if (isPunc(c, '[')) {
    if (p.type === 'op' && p.unary) return false;
    return !operandEnd(p);
  }
  if (c.type === 'op') {
    if (c.postfix) return false;
    return true;                                 // binary operators, and prefix operators after a word/operator
  }
  if (p.type === 'op') return !p.unary;          // -x  !x  ++x  have no space
  return true;
}

function renderTokens(toks) {
  classify(toks);
  for (let i = 1; i + 3 < toks.length; i++) {
    if (toks[i].text === '<' && /^\d+$/.test(toks[i + 1].text)
      && ['s', 'l'].includes(toks[i + 2].text) && toks[i + 3].text === '>') {
      for (let j = i; j <= i + 3; j++) toks[j].temporal = true;
    }
  }
  let out = '';
  let prev = null;
  for (const t of toks) {
    if (prev) {
      if (t.type === 'comment') out += t.gap === '' ? ' ' : t.gap;      // keep the author's spacing before a trailing comment
      else if (needSpace(prev, t)) out += ' ';
    }
    out += t.text;
    prev = t;
  }
  return out;
}

function leadingClosers(toks) {
  let n = 0;
  for (const t of toks) { if (isPunc(t, ')', ']', '}')) n++; else break; }
  return n;
}

// A `{` opens a dictionary after an operator, comma, ( [ : or return/throw/in; everywhere else it opens a block.
function braceKind(prev) {
  if (!prev) return 'block';
  if (prev.type === 'op') return prev.text === '=>' ? 'block' : 'dict';
  if (isPunc(prev, ',', '(', '[', ':')) return 'dict';
  if (prev.type === 'word' && (prev.text === 'return' || prev.text === 'throw' || prev.text === 'raise' || prev.text === 'in' || prev.text === 'import')) return 'dict';
  return 'block';
}

// Keeps track of open brackets. Brackets opened on the same line count as ONE indent level for the lines
// below them, so `list.map(x => {` ... `})` indents its body once. The first `skip` tokens (leading closers)
// were already removed from the stack.
function trackBrackets(toks, stack, lineId, skip) {
  let prev = null;
  toks.forEach((t, k) => {
    if (k >= skip) {
      if (isPunc(t, '(', '[', '{')) {
        if (t.text === '{') t.kind = braceKind(prev);
        stack.push({ line: lineId, kind: t.kind });
      } else if (isPunc(t, ')', ']', '}')) {
        const top = stack.pop();
        if (t.text === '}') t.kind = top ? top.kind : 'block';
      }
    }
    if (t.type !== 'bcomment') prev = t;
  });
}

const levelOf = stack => new Set(stack.map(e => e.line)).size;

function comparable(text) {
  return tokenize(text).map(t => `${t.type}\u0000${typeof t.value === 'string' ? t.value : String(t.value)}`);
}

function formatCit(text, opts = {}) {
  const unit = opts.insertSpaces === false ? '\t' : ' '.repeat(Math.max(1, opts.tabSize || 4));
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  let before;
  try { before = comparable(text); }
  catch (err) { throw new FormatError(`Cannot format because of an error: ${err.message}${err.line ? ` (line ${err.line})` : ''}`); }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const stack = [];
  let mode = null, blankPending = false;

  lines.forEach((raw, lineId) => {
    if (mode) {                                   // this line continues a multi-line string or comment
      const lexed = lexLine(raw, mode);
      trackBrackets(lexed.toks, stack, lineId, 0);
      // the text up to the closing quotes is kept exactly; anything after it is formatted
      let body = lexed.toks.length > 1 ? renderTokens(lexed.toks) : raw;
      if (lexed.mode !== 'triple' && lexed.toks.length > 1) body = body.replace(/\s+$/, '');
      out.push(body);
      mode = lexed.mode;
      blankPending = false;
      return;
    }
    if (raw.trim() === '') { blankPending = out.length > 0; return; }
    if (blankPending) { out.push(''); blankPending = false; }

    const lexed = lexLine(raw, null);
    const lead = leadingClosers(lexed.toks);
    for (let k = 0; k < lead && stack.length; k++) stack.pop();
    const level = levelOf(stack);
    trackBrackets(lexed.toks, stack, lineId, lead);
    let body = renderTokens(lexed.toks);
    if (lexed.mode !== 'triple') body = body.replace(/\s+$/, '');
    out.push(unit.repeat(level) + body);
    mode = lexed.mode;
  });

  const result = out.length ? out.join(eol) + eol : '';

  // Safety net: formatting must never change the program.
  let after;
  try { after = comparable(result); } catch (err) { throw new FormatError('Formatting was cancelled because it would have changed the program.'); }
  if (before.length !== after.length || before.some((x, i) => x !== after[i])) {
    throw new FormatError('Formatting was cancelled because it would have changed the program.');
  }
  return result;
}

module.exports = { formatCit, FormatError, lexLine };
