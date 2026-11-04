'use strict';
const fs = require('fs');
const path = require('path');

/*
 * CIT interpreter (tokenizer, parser, evaluator).
 *
 * CIT 1 adds temporal variables, sets/tuples, modules, errors and additional built-ins.
 * The words and/or/not were removed: use && || !.
 */

class CITError extends Error {
  constructor(message, line = 1, column = 1) {
    super(message);
    this.name = 'CITError';
    this.line = line;
    this.column = column;
  }
}

class CITExit extends Error {
  constructor(code) { super(); this.code = code; }
}

const BREAK = Symbol('break'), CONTINUE = Symbol('continue'), RETURN = Symbol('return');
const COMPOUND_OPS = ['+=', '-=', '*=', '/=', '%=', '**=', '//=', '|=', '&=', '^='];
const TYPE_WORDS = ['int', 'float', 'str', 'char', 'bool'];
const WIDTH_TYPES = /^(?:f(?:8|16|32|64)|i(?:8|16|32|64)|s(?:8|16|32|64)|b(?:8|16))$/;
const LITERAL_TOKENS = ['string', 'char', 'template'];
const ASSIGNABLE = ['variable', 'member', 'index', 'pattern'];
const DEFER_KINDS = ['println', 'errorln', 'warnln', 'expr', 'assign', 'block', 'if', 'while', 'dowhile', 'for', 'forin', 'switch', 'try', 'throw', 'pass'];
const PRECEDENCE = new Map(Object.entries({
  '??': 0, '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, in: 7,
  '+': 8, '-': 8, '*': 9, '/': 9, '//': 9, '%': 9, '**': 10
}));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TUPLE = Symbol('CIT tuple');
const READONLY = new WeakSet();
const FIELD_ACCESS = new WeakMap();
const mathGcd = (left, right) => {
  left = Math.abs(left); right = Math.abs(right);
  while (right) [left, right] = [right, left % right];
  return left;
};

function toJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('Cannot serialize a circular value.');
  seen.add(value);
  let converted;
  if (value instanceof Map) converted = Object.fromEntries([...value].map(([key, item]) => [String(key), toJsonValue(item, seen)]));
  else if (value instanceof Set || Array.isArray(value)) converted = [...value].map(item => toJsonValue(item, seen));
  else if (value.kind === 'function' || value.kind === 'class' || value.__module) throw new TypeError(`Cannot serialize a ${typeOf(value)}.`);
  else converted = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item, seen)]));
  seen.delete(value);
  return converted;
}

function sortJsonKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJsonKeys(value[key])]));
  }
  return value;
}

function fromJsonValue(value) {
  if (Array.isArray(value)) return value.map(fromJsonValue);
  if (value && typeof value === 'object') return new Map(Object.entries(value).map(([key, item]) => [key, fromJsonValue(item)]));
  return value;
}

function timeFromStruct(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Expected a time structure.');
  const fields = ['year', 'month', 'day', 'hour', 'minute', 'second'];
  for (const field of fields) if (!Number.isInteger(value[field])) throw new TypeError(`Time structure needs integer '${field}'.`);
  return new Date(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

function parseTime(text, format, tok) {
  if (typeof text !== 'string' || typeof format !== 'string') throw new CITError('time.strptime() needs a text and a format string.', tok.line, tok.column);
  const fields = [];
  const pattern = format.replace(/([.*+?^${}()|[\]\\])/g, '\\$1').replace(/%([YmdHMS])/g, (_, field) => {
    fields.push(field);
    return field === 'Y' ? '(\\d{4})' : '(\\d{1,2})';
  });
  const match = new RegExp(`^${pattern}$`).exec(text);
  if (!match) throw new CITError('time.strptime(): text does not match the format.', tok.line, tok.column);
  const values = { Y: 1900, m: 1, d: 1, H: 0, M: 0, S: 0 };
  fields.forEach((field, index) => { values[field] = Number(match[index + 1]); });
  return { year: values.Y, month: values.m, day: values.d, hour: values.H, minute: values.M, second: values.S, weekday: 0, yearday: 1, isdst: false };
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

// Text of a multi-line string: the newline right after the opening quotes is dropped, and when the
// closing quotes are on their own line, that line is dropped and its indentation is removed from every line.
function multilineText(raw, ESC) {
  let text = raw.replace(/\r\n/g, '\n');
  if (text.startsWith('\n')) text = text.slice(1);
  let lines = text.split('\n');
  if (lines.length > 1 && /^[ \t]*$/.test(lines[lines.length - 1])) {
    const indent = lines.pop().length;
    if (indent) lines = lines.map(x => { let k = 0; while (k < indent && (x[k] === ' ' || x[k] === '\t')) k++; return x.slice(k); });
  }
  return lines.join('\n').replace(/\\([\s\S])/g, (m, ch) => ESC[ch] ?? ch);
}

function tokenize(source) {
  const out = [];
  let i = 0, line = 1, col = 1;
  if (source.charCodeAt(0) === 0xfeff) i++;
  const adv = () => { const c = source[i++]; if (c === '\n') { line++; col = 1; } else col++; return c; };
  const add = (type, value, l = line, c = col) => out.push({ type, value, line: l, column: c });
  const ESC = { n: '\n', r: '\r', t: '\t', '"': '"', "'": "'", '\\': '\\' };

  while (i < source.length) {
    const ch = source[i];
    if (/[ \t\r\n]/.test(ch)) { adv(); continue; }
    if (ch === '#') { while (i < source.length && source[i] !== '\n') adv(); continue; }
    if (ch === '/' && source[i + 1] === '*') {
      const l = line, c = col; adv(); adv();
      let ok = false;
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') { adv(); adv(); ok = true; break; }
        adv();
      }
      if (!ok) throw new CITError('Unterminated block comment.', l, c);
      continue;
    }
    const l = line, c = col;

    // multi-line strings:  """ ... """   and   $""" ... """
    if ((ch === '"' && source.startsWith('"""', i)) || (ch === '$' && source.startsWith('$"""', i))) {
      const isTemplate = ch === '$';
      if (isTemplate) adv();
      adv(); adv(); adv();
      let raw = '', ok = false;
      while (i < source.length) {
        if (source[i] === '\\' && i + 1 < source.length) { raw += adv(); raw += adv(); continue; }
        if (source.startsWith('"""', i)) { adv(); adv(); adv(); ok = true; break; }
        raw += adv();
      }
      if (!ok) throw new CITError('Unterminated multi-line string.', l, c);
      add(isTemplate ? 'template' : 'string', multilineText(raw, ESC), l, c);
      continue;
    }

    if (ch === '$' && source[i + 1] === '"') {
      adv(); adv();
      let v = '', ok = false;
      while (i < source.length) {
        const x = adv();
        if (x === '\\') { if (i < source.length) { const e = adv(); v += ESC[e] ?? e; } }
        else if (x === '"') { ok = true; break; }
        else v += x;
      }
      if (!ok) throw new CITError('Unterminated template string.', l, c);
      add('template', v, l, c);
      continue;
    }

    if (ch === '"' || ch === "'") {
      const q = adv();
      let v = '', ok = false;
      while (i < source.length) {
        const x = adv();
        if (x === '\\') { if (i < source.length) { const e = adv(); v += ESC[e] ?? e; } }
        else if (x === q) { ok = true; break; }
        else { if (x === '\n') throw new CITError('Unterminated string literal.', l, c); v += x; }
      }
      if (!ok) throw new CITError('Unterminated string literal.', l, c);
      if (q === "'" && [...v].length !== 1) throw new CITError('A char literal must contain exactly one character.', l, c);
      add(q === '"' ? 'string' : 'char', v, l, c);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let v = '';
      while (/[0-9]/.test(source[i] || '')) v += adv();
      if (source[i] === '.' && /[0-9]/.test(source[i + 1] || '')) {
        v += adv();
        while (/[0-9]/.test(source[i] || '')) v += adv();
        add('float', Number(v), l, c);
      } else add('int', Number(v), l, c);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let v = '';
      while (/[A-Za-z0-9_]/.test(source[i] || '')) v += adv();
      add('identifier', v, l, c);
      continue;
    }

    const three = source.slice(i, i + 3);
    if (three === '**=' || three === '//=') { adv(); adv(); adv(); add('operator', three, l, c); continue; }
    if (['|=', '&=', '^='].includes(source.slice(i, i + 2))) { adv(); adv(); add('operator', source.slice(i - 2, i), l, c); continue; }
    if (three === '...') { adv(); adv(); adv(); add('punctuation', three, l, c); continue; }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '??', '**', '//', '+=', '-=', '*=', '/=', '%=', '++', '--', '=>'].includes(two)) {
      adv(); adv(); add('operator', two, l, c); continue;
    }
    if (two === '?.') { adv(); adv(); add('punctuation', '?.', l, c); continue; }
    if ('+-*/%<>=!|&^'.includes(ch)) { adv(); add('operator', ch, l, c); continue; }
    if ('(){}[];,.:@'.includes(ch)) { adv(); add('punctuation', ch, l, c); continue; }
    if (ch === '$') { adv(); add('punctuation', '$', l, c); continue; }
    throw new CITError(`Unexpected character '${ch}'.`, l, c);
  }
  out.push({ type: 'eof', value: '', line, column: col });
  return out;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; this.inArgs = false; this.asyncDepth = 0; this.genericNames = new Set(); }
  cur() { return this.tokens[this.pos]; }
  peek(n = 1) { return this.tokens[this.pos + n]; }
  // Text inside a string must never be mistaken for syntax, so literals are skipped here.
  check(v) { const t = this.cur(); return t.value === v && !LITERAL_TOKENS.includes(t.type); }
  match(...vs) { for (const v of vs) if (this.check(v)) { this.pos++; return true; } return false; }
  consume(v, msg) {
    if (this.check(v)) return this.tokens[this.pos++];
    const t = this.cur();
    throw new CITError(msg || `Expected '${v}', found '${t.value || 'end of file'}'.`, t.line, t.column);
  }
  ident(msg = 'Expected an identifier.') {
    const t = this.cur();
    if (t.type !== 'identifier') throw new CITError(msg, t.line, t.column);
    this.pos++;
    return t;
  }
  // Inside call arguments, list items and dictionary values a comma separates items,
  // so `a, b => ...` (lambda without parentheses) is not allowed there.
  withArgs(fn) { const saved = this.inArgs; this.inArgs = true; try { return fn(); } finally { this.inArgs = saved; } }

  parse() { const a = []; while (this.cur().type !== 'eof') a.push(this.statement()); return a; }

  block() {
    const saved = this.inArgs; this.inArgs = false;
    try {
      this.consume('{', "Expected '{'.");
      const a = [];
      while (!this.check('}') && this.cur().type !== 'eof') a.push(this.statement());
      this.consume('}', "Expected '}' to close block.");
      return a;
    } finally { this.inArgs = saved; }
  }

  condition() { this.consume('('); const c = this.expression(); this.consume(')'); return c; }

  params() {
    this.consume('(');
    const params = [];
    let sawArgs = false, sawKwargs = false;
    this.withArgs(() => {
      if (!this.check(')')) do {
        let kind = 'normal';
        if (this.match('**')) { kind = 'kwargs'; sawKwargs = true; }
        else if (this.match('*')) { kind = 'args'; sawArgs = true; }
        if ((sawKwargs && kind !== 'kwargs') || (sawArgs && kind === 'normal')) {
          throw new CITError('Variadic parameters must be ordered as *args followed by **kwargs.', this.cur().line, this.cur().column);
        }
        const p = this.ident('Expected parameter name.');
        const name = p.value;
        let def = null;
        if (this.match('=')) def = this.expression();
        if (kind !== 'normal' && def !== null) throw new CITError('Variadic parameters cannot have default values.', p.line, p.column);
        params.push({ name, default: def, kind });
      } while (this.match(','));
    });
    this.consume(')');
    return params;
  }

  genericParams() {
    if (!this.match('<')) return [];
    const names = [this.ident('Expected a generic type parameter name.').value];
    while (this.match(',')) names.push(this.ident('Expected another generic type parameter name.').value);
    this.consume('>', "Expected '>' after generic type parameters.");
    if (new Set(names).size !== names.length) throw new CITError('Generic type parameter names must be unique.', this.cur().line, this.cur().column);
    return names;
  }

  // let [mut] name                       (empty variable, needs mut)
  // let [mut] name = value
  // let [mut] a, b, c = 1, 2, 3          (multiple variables)
  declaration() {
    const token = this.consume('let');
    const mutable = this.match('mut');
    let pattern = null;
    const names = [];
    if (this.match('[')) {
      pattern = [];
      while (!this.check(']')) {
        if (this.match(',')) { pattern.push(null); continue; }
        const name = this.ident('Expected a variable name in the destructuring pattern.');
        names.push(name); pattern.push(name);
        if (!this.match(',')) break;
      }
      if (this.match(',')) pattern.push(null);
      this.consume(']', "Expected ']' after the destructuring pattern.");
      if (!names.length) throw new CITError('A destructuring pattern needs at least one variable.', token.line, token.column);
    } else {
      names.push(this.ident('Expected variable name after let.'));
      while (this.match(',')) names.push(this.ident("Expected another variable name after ','."));
    }
    let temporal = null;
    if (this.match('<')) {
      const duration = this.cur();
      if (duration.type !== 'int' || !this.tokens[this.pos + 1] || !['s', 'l', 'r'].includes(this.tokens[this.pos + 1].value)) {
        throw new CITError("Expected a temporal duration such as '<2s>', '<30l>' or '<5r>'.", duration.line, duration.column);
      }
      this.pos++;
      temporal = { amount: duration.value, unit: this.cur().value };
      this.pos++;
      if (this.match('=')) temporal.mode = this.ident("Expected a temporal mode such as 'offline' or 'stopUse'.").value;
      this.consume('>', "Expected '>' after the temporal duration.");
      if (temporal.amount <= 0) throw new CITError('A temporal duration must be greater than 0.', duration.line, duration.column);
      if (temporal.mode && !['offline', 'stopUse'].includes(temporal.mode)) throw new CITError("Temporal modes must be 'offline' or 'stopUse'.", duration.line, duration.column);
      if (temporal.mode && temporal.unit !== 's') throw new CITError("Temporal modes 'offline' and 'stopUse' can only be used with seconds ('s').", duration.line, duration.column);
      temporal.constraints = [{ amount: temporal.amount, unit: temporal.unit, mode: temporal.mode }];
      if (this.match('after')) {
        this.consume('<', "Expected '<' before the chained temporal duration.");
        const nextDuration = this.cur();
        if (nextDuration.type !== 'int' || !this.tokens[this.pos + 1] || !['s', 'l', 'r'].includes(this.tokens[this.pos + 1].value)) {
          throw new CITError("Expected a temporal duration such as '<30l>'.", nextDuration.line, nextDuration.column);
        }
        this.pos++;
        const constraint = { amount: nextDuration.value, unit: this.cur().value };
        this.pos++;
        this.consume('>', "Expected '>' after the chained temporal duration.");
        if (constraint.amount <= 0) throw new CITError('A temporal duration must be greater than 0.', nextDuration.line, nextDuration.column);
        temporal.constraints.push(constraint);
      }
    }
    const first = names[0];
    const list = names.map(n => n.value).join(', ');

    if (!this.match('=')) {
      if (!mutable) {
        throw new CITError(`'${list}' has no value, so it must be declared with 'let mut'. Example: let mut ${list}`, first.line, first.column);
      }
      return { kind: 'declare', names, pattern, mutable, exprs: null, temporal, token };
    }
    const exprs = [this.expression()];
    while (this.match(',')) exprs.push(this.expression());
    if (exprs.length !== names.length && !(exprs.length === 1 && names.length > 1)) {
      throw new CITError(`Expected ${names.length} value${names.length === 1 ? '' : 's'} for ${list} but found ${exprs.length}.`, first.line, first.column);
    }
    return { kind: 'declare', names, pattern, mutable, exprs, temporal, broadcast: exprs.length === 1 && names.length > 1, token };
  }

  statement() {
    if (this.match(';')) return { kind: 'empty' };
    if (this.match('reactive')) {
      const declaration = this.statement();
      if (declaration.kind !== 'declare') throw new CITError("'reactive' must precede a variable declaration.", this.cur().line, this.cur().column);
      declaration.reactive = true;
      return declaration;
    }
    if (this.match('watch')) {
      const name = this.ident("Expected a variable name after 'watch'.");
      return { kind: 'watch', name, body: this.block() };
    }
    if (this.match('static')) {
      if (!this.check('let')) throw new CITError("'static' must be followed by a variable declaration.", this.cur().line, this.cur().column);
      return { ...this.declaration(), isStatic: true };
    }
    if (this.match('const')) {
      const name = this.ident("Expected a constant name after 'const'.");
      this.consume('=', "Expected '=' after the constant name.");
      return { kind: 'declare', names: [name], pattern: null, mutable: false, exprs: [this.expression()], temporal: null, broadcast: false, token: name };
    }
    if (this.check('private') || this.check('protected')) {
      const visibility = this.cur().value;
      const modifier = this.cur(); this.pos++;
      const statement = this.statement();
      if (statement.kind === 'declare') {
        statement.visibility = visibility;
        return statement;
      }
      if (statement.kind !== 'assign' || statement.target.kind !== 'member' || statement.target.object.kind !== 'variable' || statement.target.object.name !== 'self') {
        throw new CITError(`${visibility} can only be used on a class field or self field assignment.`, modifier.line, modifier.column);
      }
      statement.visibility = visibility;
      return statement;
    }
    if (this.check('let')) {
      if (this.peek()?.value === 'enum') {
        this.consume('let');
        this.consume('enum');
        const name = this.ident('Expected an enum name.');
        this.consume('=');
        return { kind: 'enum', name: name.value, expr: this.expression(), token: name };
      }
      return this.declaration();
    }

    if (this.match('@')) {
      const decorators = [];
      do {
        const name = this.ident('Expected a decorator name after @');
        decorators.push({ kind: 'variable', name: name.value, token: name });
      } while (this.match('@'));
      const decorated = this.statement();
      if (decorated.kind !== 'function') throw new CITError('Decorators can only be applied to functions.', this.cur().line, this.cur().column);
      decorated.decorators = decorators;
      return decorated;
    }

    if (this.match('final')) {
      if (!this.match('class')) throw new CITError("'final' must be followed by a class declaration.", this.cur().line, this.cur().column);
      const n = this.ident('Expected class name.');
      this.consume('(');
      let parent = null;
      if (!this.check(')')) {
        parent = this.ident('Expected the parent class name.');
        if (this.match('(')) this.consume(')', 'Write the parent class as parent() with empty parentheses.');
      }
      this.consume(')');
      return { kind: 'class', name: n.value, parent, body: this.block(), token: n, final: true };
    }

    if (this.cur().type === 'identifier' && TYPE_WORDS.includes(this.cur().value)) {
      const type = this.cur().value; this.pos++;
      const n = this.ident();
      let width = null;
      if (this.match(':')) {
        const widthToken = this.ident('Expected a storage width such as f16 or i32.');
        if (!WIDTH_TYPES.test(widthToken.value) || widthToken.value[0] !== type[0]) {
          throw new CITError(`Storage width '${widthToken.value}' does not match type '${type}'.`, widthToken.line, widthToken.column);
        }
        width = widthToken.value;
      }
      this.consume('=');
      return { kind: 'typed', name: n.value, type, width, expr: this.expression(), token: n };
    }

    if (this.match('fn')) {
      const n = this.ident('Expected function name.');
      const genericParams = this.genericParams();
      if (genericParams.length) this.genericNames.add(n.value);
      const params = this.params();
      return { kind: 'function', name: n.value, params, genericParams, body: this.block(), token: n };
    }

    if (this.match('async')) {
      this.consume('fn', "'async' must be followed by a function declaration.");
      const n = this.ident('Expected function name.');
      const genericParams = this.genericParams();
      if (genericParams.length) this.genericNames.add(n.value);
      const params = this.params();
      this.asyncDepth++;
      let body;
      try { body = this.block(); } finally { this.asyncDepth--; }
      return { kind: 'function', name: n.value, params, genericParams, body, token: n, isAsync: true };
    }

    if (this.match('operator')) {
      const operator = this.cur();
      if (operator.type !== 'operator' || !['+', '-', '*', '/', '%', '**', '==', '!=', '<', '>', '<=', '>='].includes(operator.value)) {
        throw new CITError('Unsupported custom operator.', operator.line, operator.column);
      }
      this.pos++;
      const params = this.params();
      if (params.length !== 1 || params[0].kind !== 'normal') throw new CITError('A custom binary operator needs exactly one parameter.', operator.line, operator.column);
      return { kind: 'operator', operator: operator.value, params, body: this.block(), token: operator };
    }

    if (this.check('get') || this.check('set')) {
      const accessor = this.cur().value; this.pos++;
      this.consume('fn', `Expected 'fn' after '${accessor}'.`);
      const n = this.ident(`Expected a property name after '${accessor} fn'.`);
      const params = this.params();
      if ((accessor === 'get' && params.length) || (accessor === 'set' && params.length !== 1)) {
        throw new CITError(`A ${accessor}ter must take ${accessor === 'get' ? 'no parameters' : 'exactly one parameter'}.`, n.line, n.column);
      }
      return { kind: 'function', name: n.value, params, body: this.block(), token: n, accessor };
    }

    // class name() { ... }     class child(parent()) { ... }
    if (this.match('class')) {
      const n = this.ident('Expected class name.');
      this.consume('(');
      let parent = null;
      if (!this.check(')')) {
        parent = this.ident('Expected the parent class name.');
        if (this.match('(')) this.consume(')', 'Write the parent class as parent() with empty parentheses.');
      }
      this.consume(')');
      return { kind: 'class', name: n.value, parent, body: this.block(), token: n, final: false };
    }

    if (this.match('guard')) {
      const condition = this.condition();
      this.consume('else', "Expected 'else' after the guard condition.");
      return { kind: 'guard', condition, body: this.block() };
    }

    if (this.match('if')) {
      const condition = this.condition();
      const yes = this.block(), elseif = [];
      while (this.match('elseif')) { const c = this.condition(); elseif.push({ condition: c, body: this.block() }); }
      const no = this.match('else') ? this.block() : null;
      return { kind: 'if', condition, yes, elseif, no };
    }

    if (this.match('while')) { const condition = this.condition(); return { kind: 'while', condition, body: this.block() }; }

    if (this.match('with')) {
      const resource = this.expression();
      this.consume('as', "Expected 'as' and a variable name after the resource.");
      const name = this.ident('Expected a resource variable name.');
      return { kind: 'with', resource, name, body: this.block() };
    }

    if (this.match('do')) {
      const body = this.block();
      this.consume('while', "Expected 'while' after the do block.");
      return { kind: 'dowhile', body, condition: this.condition() };
    }

    // switch (value) { case a, b { ... } case default { ... } }
    if (this.match('switch')) {
      const subject = this.condition();
      this.consume('{', "Expected '{' after switch (...).");
      const cases = [];
      let hasDefault = false;
      while (!this.check('}') && this.cur().type !== 'eof') {
        const ct = this.consume('case', "Expected 'case' inside a switch block.");
        if (this.check('default')) {
          this.pos++;
          if (hasDefault) throw new CITError("A switch can only have one 'case default'.", ct.line, ct.column);
          hasDefault = true;
          cases.push({ isDefault: true, body: this.block() });
        } else {
          const tests = [this.expression()];
          while (this.match(',')) tests.push(this.expression());
          cases.push({ isDefault: false, tests, body: this.block() });
        }
      }
      this.consume('}', "Expected '}' to close the switch.");
      return { kind: 'switch', subject, cases };
    }

    // for (let i, range(0, 10)) { }    for (let mut i, range(0, 10, 2)) { }    for (let item in list) { }
    if (this.match('for')) {
      this.consume('(');
      this.match('let');
      const mutable = this.match('mut');
      const n = this.ident('Expected loop variable.');
      if (this.match('in')) {
        const iter = this.expression();
        this.consume(')');
        const body = this.block();
        const otherwise = this.match('else') ? this.block() : null;
        return { kind: 'forin', name: n.value, mutable, iter, body, otherwise, token: n };
      }
      this.consume(',', "Expected ',' after the loop variable: for (let i, range(0, 10)).");
      const rt = this.consume('range', "Expected 'range(...)' in the for loop: for (let i, range(0, 10)).");
      if (this.check('=')) {
        throw new CITError("The for loop is now written for (let i, range(0, 10)). The old 'range = 0, 10' form is no longer supported.", rt.line, rt.column);
      }
      this.consume('(', "Expected '(' after range: for (let i, range(0, 10)).");
      const args = [];
      this.withArgs(() => { do { args.push(this.expression()); } while (this.match(',')); });
      if (args.length > 3) throw new CITError('range() in a for loop takes 1 to 3 values: range(stop), range(start, stop) or range(start, stop, step).', rt.line, rt.column);
      this.consume(')', "Expected ')' to close range(...).");
      this.consume(')', "Expected ')' to close the for loop header.");
      const body = this.block();
      const otherwise = this.match('else') ? this.block() : null;
      return { kind: 'for', name: n.value, mutable, args, body, otherwise, token: n };
    }

    // try { } catch (err) { } except ValueError as err { } finally { }
    if (this.match('try')) {
      const body = this.block();
      const handlers = [];
      while (this.match('catch', 'except')) {
        const keyword = this.tokens[this.pos - 1].value;
        let errorType = null, name = null;
        if (keyword === 'catch') {
          if (this.match('(')) { name = this.ident('Expected a name for the error, for example catch (err).'); this.consume(')'); }
        } else {
          errorType = this.ident('Expected an error type after except.').value;
          if (this.match('as')) name = this.ident('Expected a name after as.');
          else if (this.match('(')) { name = this.ident('Expected an error variable.'); this.consume(')'); }
        }
        handlers.push({ errorType, name, body: this.block() });
      }
      const finallyBody = this.match('finally') ? this.block() : null;
      if (!handlers.length && !finallyBody) throw new CITError("Expected 'catch', 'except' or 'finally' after the try block.", this.cur().line, this.cur().column);
      return { kind: 'try', body, handlers, finallyBody };
    }

    if (this.check('throw') && this.cur().type === 'identifier') {
      const t = this.cur(); this.pos++;
      return { kind: 'throw', expr: this.expression(), token: t };
    }

    if (this.match('raise')) {
      const errorType = this.ident('Expected an error type after raise.');
      let expr = { kind: 'literal', value: errorType.value, litType: 'string', token: errorType };
      if (this.match('(')) {
        if (!this.check(')')) expr = this.expression();
        this.consume(')');
      }
      return { kind: 'throw', expr, errorType: errorType.value, token: errorType };
    }

    // defer <statement>: runs when the surrounding function ends
    if (this.check('defer') && this.cur().type === 'identifier') {
      const t = this.cur(); this.pos++;
      const stmt = this.statement();
      if (!DEFER_KINDS.includes(stmt.kind)) throw new CITError('defer needs a statement such as a call, an assignment or a { block }.', t.line, t.column);
      return { kind: 'defer', stmt, token: t };
    }

    if (this.match('import')) {
      const t = this.cur();
      if (this.cur().type === 'identifier' && this.peek()?.value === 'from') {
        const name = this.cur(); this.pos++;
        this.consume('from');
        const module = this.ident('Expected a module name after from.');
        return { kind: 'fromImport', name: name.value, module: module.value, token: t };
      }
      if (this.match('{')) {
        const names = [];
        while (!this.check('}')) {
          if (this.match('...')) break;
          names.push(this.ident('Expected a package name inside the import list.').value);
          if (!this.match(',')) break;
        }
        this.consume('}', "Expected '}' to close the import list.");
        return { kind: 'importMany', names, token: t };
      }
      if (t.type !== 'string' && !(t.type === 'identifier' && ['math', 'json', 'time', 'datetime', 'cli', 'sys', 'database'].includes(t.value))) throw new CITError("Expected a package or file name after 'import'.", t.line, t.column);
      this.pos++;
      let alias = null;
      if (this.match('as')) alias = this.ident("Expected a name after 'as'.").value;
      return { kind: 'import', path: t.value, alias, token: t };
    }

    if (this.match('return')) {
      return { kind: 'return', expr: this.check(';') || this.check('}') || this.cur().type === 'eof' ? null : this.expression() };
    }
    if (this.match('break')) return { kind: 'break' };
    if (this.match('continue')) return { kind: 'continue' };
    if (this.match('pass')) return { kind: 'pass' };
    if (this.check('{')) return { kind: 'block', body: this.block() };

    if (this.cur().type === 'identifier' && ['println', 'errorln', 'warnln'].includes(this.cur().value)) {
      const kind = this.cur().value; this.pos++;
      this.consume('(');
      const args = [];
      this.withArgs(() => { if (!this.check(')')) do { args.push(this.expression()); } while (this.match(',')); });
      this.consume(')');
      return { kind, args };
    }

    // Expression statement, or an assignment: target = value, target += value, ...
    const expr = this.expression();
    const t = this.cur();
    if (t.type === 'operator' && (t.value === '=' || COMPOUND_OPS.includes(t.value))) {
      const target = expr.kind === 'list' && expr.items.every(item => item === null || item.kind === 'variable')
        ? { ...expr, kind: 'pattern' }
        : expr;
      if (!ASSIGNABLE.includes(target.kind)) throw new CITError('The left side of an assignment must be a variable, property, list item or dictionary item.', t.line, t.column);
      this.pos++;
      return { kind: 'assign', target, op: t.value, expr: this.expression(), token: t };
    }
    return { kind: 'expr', expr };
  }

  expression() {
    const test = this.binary(0);
    if (!this.check('if') || this.cur().line !== this.tokens[this.pos - 1].line) return test;
    this.pos++;
    const condition = this.condition();
    this.consume('else', "Expected 'else' in the conditional expression.");
    return { kind: 'conditional', test, condition, otherwise: this.expression() };
  }

  binary(min) {
    let left;
    const t0 = this.cur();
    if (this.match('await')) {
      if (!this.asyncDepth) throw new CITError("'await' can only be used inside an async function.", t0.line, t0.column);
      left = { kind: 'await', expr: this.binary(11), token: t0 };
    } else if ((this.check('++') || this.check('--'))) {                // ++n  --n
      this.pos++;
      const target = this.postfix();
      if (!ASSIGNABLE.includes(target.kind)) throw new CITError(`'${t0.value}' needs a variable, property or list item.`, t0.line, t0.column);
      left = { kind: 'update', op: t0.value, prefix: true, target, token: t0 };
    } else if (this.match('!', '-', '+')) {
      left = { kind: 'unary', op: t0.value, expr: this.binary(11) };
    } else left = this.postfix();
    for (;;) {
      const t = this.cur();
      if (t.type === 'identifier' && (t.value === 'and' || t.value === 'or')) {
        const nx = this.peek();
        if (nx && nx.line === t.line && (['identifier', 'int', 'float', 'string', 'char', 'template'].includes(nx.type) || (nx.type === 'punctuation' && (nx.value === '(' || nx.value === '[')))) {
          throw new CITError(`'${t.value}' is not a keyword anymore. Use ${t.value === 'and' ? '&&' : '||'} instead (for example: a ${t.value === 'and' ? '&&' : '||'} b).`, t.line, t.column);
        }
      }
      const isOp = t.type === 'operator' || (t.type === 'identifier' && t.value === 'in');
      const p = isOp ? PRECEDENCE.get(t.value) : undefined;
      if (p === undefined || p < min) break;
      this.pos++;
      const right = this.binary(p + (t.value === '**' ? 0 : 1));
      const equality = node => node.kind === 'binary' && ['==', '!='].includes(node.op);
      if (t.value === '||' && equality(left) && !equality(right)) {
        left = left.kind === 'oneOf'
          ? { ...left, candidates: [...left.candidates, right] }
          : { kind: 'oneOf', op: left.op, subject: left.left, candidates: [left.right, right], token: t };
      } else if (t.value === '||' && left.kind === 'oneOf' && !equality(right)) {
        left = { ...left, candidates: [...left.candidates, right] };
      } else left = { kind: 'binary', op: t.value, left, right, token: t };
    }
    return left;
  }

  postfix() {
    let e = this.primary();
    for (;;) {
      if (e.kind === 'variable' && this.genericNames.has(e.name) && this.match('<')) {
        const typeArgs = [this.ident('Expected a generic type argument.').value];
        while (this.match(',')) typeArgs.push(this.ident('Expected another generic type argument.').value);
        this.consume('>', "Expected '>' after generic type arguments.");
        e = { ...e, typeArgs };
        continue;
      }
      if (this.check('.') || this.check('?.')) {
        const optional = this.cur().value === '?.';
        this.pos++;
        const name = this.ident('Expected property or method name.');
        e = { kind: 'member', object: e, name: name.value, optional, token: name };
        continue;
      }
      if (this.check('[') && this.cur().line === this.tokens[this.pos - 1].line) {
        const tok = this.cur(); this.pos++;
        let start = null, end = null, step = null;
        if (!this.check(':') && !this.check(']')) start = this.withArgs(() => this.expression());
        if (this.match(':')) {
          if (!this.check(':') && !this.check(']')) end = this.withArgs(() => this.expression());
          if (this.match(':') && !this.check(']')) step = this.withArgs(() => this.expression());
          this.consume(']', "Expected ']' after the slice.");
          e = { kind: 'slice', object: e, start, end, step, token: tok };
        } else {
          if (!start) throw new CITError('An index cannot be empty.', tok.line, tok.column);
          this.consume(']', "Expected ']' after the index.");
          e = { kind: 'index', object: e, index: start, token: tok };
        }
        continue;
      }
      if (this.match('(')) {
        const args = [];
        this.withArgs(() => {
          if (!this.check(')')) do {
            let name = null;
            const nx = this.peek();
            if (this.cur().type === 'identifier' && nx && ((nx.type === 'punctuation' && nx.value === ':') || (nx.type === 'operator' && nx.value === '='))) { name = this.cur().value; this.pos += 2; }
            if (this.cur().type === 'identifier' && ['admin', 'required', 'disabled', 'multiple', 'checked', 'readonly', 'autofocus'].includes(this.cur().value)
              && this.peek()?.type === 'punctuation' && [',', ')'].includes(this.peek().value)) {
              args.push({ name: this.cur().value, value: { kind: 'literal', value: true } });
              this.pos++;
            } else args.push({ name, value: this.expression() });
          } while (this.match(','));
        });
        this.consume(')');
        e = { kind: 'call', callee: e, args };
        continue;
      }
      break;
    }
    // n++  n--   (must be on the same line as the variable)
    const t = this.cur();
    if (t.type === 'operator' && (t.value === '++' || t.value === '--') && ASSIGNABLE.includes(e.kind) && t.line === this.tokens[this.pos - 1].line) {
      this.pos++;
      return { kind: 'update', op: t.value, prefix: false, target: e, token: t };
    }
    return e;
  }

  // Finds  x =>   x, y =>   (x, y) =>   () =>   at the current position.
  arrowAhead() {
    const T = this.tokens;
    const isP = (tok, v) => tok.type === 'punctuation' && tok.value === v;
    const isArrow = tok => tok.type === 'operator' && tok.value === '=>';
    let i = this.pos;
    const params = [];
    if (isP(T[i], '(')) {
      i++;
      if (isP(T[i], ')')) i++;
      else for (;;) {
        if (T[i].type !== 'identifier') return null;
        params.push(T[i].value); i++;
        if (isP(T[i], ',')) { i++; continue; }
        if (isP(T[i], ')')) { i++; break; }
        return null;
      }
      return isArrow(T[i]) ? { params, end: i + 1 } : null;
    }
    if (T[i].type !== 'identifier') return null;
    params.push(T[i].value); i++;
    if (isArrow(T[i])) return { params, end: i + 1 };
    if (!this.inArgs) {
      while (isP(T[i], ',') && T[i + 1].type === 'identifier') {
        params.push(T[i + 1].value); i += 2;
        if (isArrow(T[i])) return { params, end: i + 1 };
      }
    }
    return null;
  }

  primary() {
    const t = this.cur();

    if (t.type === 'identifier' && t.value === 'not') {
      const nx = this.peek();
      if (nx && nx.line === t.line && ['identifier', 'int', 'float', 'string', 'char', 'template'].includes(nx.type)) {
        throw new CITError("'not' is not a keyword anymore. Use ! instead (for example: !done).", t.line, t.column);
      }
    }

    const arrow = this.arrowAhead();
    if (arrow) {
      this.pos = arrow.end;
      let body;
      if (this.check('{')) body = this.block();
      else if (this.check('return')) body = [this.statement()];
      else body = [{ kind: 'return', expr: this.expression() }];
      return { kind: 'lambda', name: null, params: arrow.params.map(name => ({ name, default: null })), body, token: t };
    }

    if (this.check('fn')) {                                       // fn name(x) { ... }  used as a value
      this.pos++;
      let name = null;
      if (this.cur().type === 'identifier' && this.peek()?.value === '(') { name = this.cur().value; this.pos++; }
      const params = this.params();
      return { kind: 'lambda', name, params, body: this.block(), token: t };
    }

    if (this.match('if')) {
      const condition = this.condition();
      const yes = this.block();
      this.consume('else', "Expected 'else' after the conditional expression.");
      return { kind: 'conditionalBlock', condition, yes, no: this.block(), token: t };
    }

    if (this.match('true')) return { kind: 'literal', value: true };
    if (this.match('false')) return { kind: 'literal', value: false };
    if (this.match('null')) return { kind: 'literal', value: null };
    if (['int', 'float', 'string', 'char', 'template'].includes(t.type)) {
      this.pos++;
      return { kind: 'literal', value: t.value, litType: t.type, token: t };
    }

    if (this.match('_')) return { kind: 'literal', value: null, token: t };

    if (this.check('[')) {                                        // list
      this.pos++;
      const items = [];
      this.withArgs(() => { if (!this.check(']')) do {
        if (this.check(']')) break;
        if (this.check(',')) { items.push(null); continue; }
        items.push(this.expression());
      } while (this.match(',')); });
      this.consume(']', "Expected ']' to close the list.");
      return { kind: items.some(item => item === null) ? 'pattern' : 'list', items, token: t };
    }

    if (this.check('{')) {                                        // dictionary or set
      this.pos++;
      if (this.check('}')) { this.pos++; return { kind: 'dict', entries: [], token: t }; }
      if (this.peek()?.value !== ':') {
        const items = [];
        this.withArgs(() => {
          items.push(this.expression());
          while (this.match(',')) { if (!this.check('}')) items.push(this.expression()); }
        });
        this.consume('}', "Expected '}' to close the set.");
        return { kind: 'set', items, token: t };
      }
      const entries = [];
      this.withArgs(() => {
        while (!this.check('}')) {
          const kt = this.cur();
          let key;
          if (kt.type === 'identifier') { this.pos++; key = { kind: 'literal', value: kt.value, litType: 'string', token: kt }; }
          else if (['string', 'char', 'int', 'float'].includes(kt.type)) { this.pos++; key = { kind: 'literal', value: kt.value, litType: kt.type, token: kt }; }
          else throw new CITError("Expected a dictionary key (a name, a string or a number).", kt.line, kt.column);
          this.consume(':', "Expected ':' after the dictionary key.");
          entries.push({ key, value: this.expression() });
          if (!this.match(',')) break;
        }
      });
      this.consume('}', "Expected '}' to close the dictionary.");
      return { kind: 'dict', entries, token: t };
    }

    if (this.match('(')) {
      const first = this.expression();
      if (!this.match(',')) { this.consume(')'); return first; }
      const items = [first];
      this.withArgs(() => {
        do { if (this.check(')')) break; items.push(this.expression()); } while (this.match(','));
      });
      this.consume(')', "Expected ')' to close the tuple.");
      return { kind: 'tuple', items, token: t };
    }
    if (this.match('$')) {
      const name = this.ident('Expected a color or style variable name after $.');
      return { kind: 'variable', name: `$${name.value}`, token: t };
    }
    if (t.type === 'identifier') {
      this.pos++;
      const value = { kind: 'variable', name: t.value, token: t };
      if (this.match(':')) return { kind: 'tree', root: value, child: this.expression(), token: t };
      return value;
    }
    throw new CITError(`Expected expression, found '${t.value || 'end of file'}'.`, t.line, t.column);
  }
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

function typeOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return v[TUPLE] ? 'tuple' : 'list';
  if (v instanceof Map) return 'dict';
  if (v instanceof Set) return 'set';
  if (typeof v === 'function') return 'function';
  if (v.kind === 'function') return 'function';
  if (v.kind === 'class') return 'class';
  if (v.__module) return 'module';
  return 'object';
}

function checked(v, t, tok = { line: 1, column: 1 }) {
  const actual = typeOf(v);
  if (actual === t || (t === 'float' && actual === 'int')) return v;
  if (t === 'char' && typeof v === 'string' && [...v].length === 1) return v;
  throw new CITError(`Type mismatch: expected ${t}, received ${actual}.`, tok.line, tok.column);
}

function castWidth(value, width, tok = { line: 1, column: 1 }) {
  const fail = msg => { throw new CITError(msg, tok.line, tok.column); };
  const bits = Number(width.slice(1));
  if (width[0] === 'i') {
    if (!Number.isSafeInteger(value)) fail(`${width} requires a safe integer.`);
    const min = bits === 64 ? Number.MIN_SAFE_INTEGER : -(2 ** (bits - 1));
    const max = bits === 64 ? Number.MAX_SAFE_INTEGER : 2 ** (bits - 1) - 1;
    if (value < min || value > max) fail(`${value} is outside the ${width} range (${min} to ${max}).`);
    return value;
  }
  if (width[0] === 'f') {
    if (typeof value !== 'number') fail(`${width} requires a number.`);
    if (width === 'f32') return Math.fround(value);
    if (width === 'f64') return value;
    if (!Number.isFinite(value)) return value;
    const precision = width === 'f16' ? 11 : 4;
    const exponent = Math.floor(Math.log2(Math.abs(value)));
    if (exponent < -14 && width === 'f16') return 0;
    if (exponent < -6 && width === 'f8') return 0;
    const quantum = 2 ** (exponent - precision + 1);
    return Math.round(value / quantum) * quantum;
  }
  if (width[0] === 's') {
    if (typeof value !== 'string') fail(`${width} requires a string.`);
    const maxBytes = bits;
    if (Buffer.byteLength(value, 'utf8') > maxBytes) fail(`Text exceeds the ${width} storage limit of ${maxBytes} UTF-8 bytes.`);
    return value;
  }
  if (width[0] === 'b' && typeof value !== 'boolean') fail(`${width} requires a boolean.`);
  return value;
}

const truthy = v => v !== false && v !== null && v !== undefined && v !== 0 && v !== ''
  && !(Array.isArray(v) && v.length === 0) && !(v instanceof Map && v.size === 0) && !(v instanceof Set && v.size === 0);

function formatKey(k) {
  return typeof k === 'string' ? (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k)) : String(k);
}

// How a value is printed. Strings are quoted only when they are inside a list or dictionary.
function format(v, nested = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return (v[TUPLE] ? '(' : '[') + v.map(x => format(x, true)).join(', ') + (v[TUPLE] ? ')' : ']');
  if (v instanceof Map) return '{' + [...v].map(([k, x]) => `${formatKey(k)}: ${format(x, true)}`).join(', ') + '}';
  if (v instanceof Set) return '{' + [...v].map(x => format(x, true)).join(', ') + '}';
  if (typeof v === 'function') return '<function>';
  if (typeof v === 'object') {
    if (v.kind === 'function') return `<fn ${v.name || 'anonymous'}>`;
    if (v.kind === 'class') return `<class ${v.name}>`;
    if (v.__module) return `<module ${v.__module}>`;
    if (v.__class) return `<${v.__class} object>`;
    return '<object>';
  }
  return String(v);
}

function valuesEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return Boolean(a[TUPLE]) === Boolean(b[TUPLE]) && a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  }
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, x]) => b.has(k) && valuesEqual(x, b.get(k)));
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every(x => [...b].some(y => valuesEqual(x, y)));
  return a === b;
}

function dictKey(k, tok = { line: 1, column: 1 }) {
  if (typeof k === 'string' || typeof k === 'boolean' || (typeof k === 'number' && !Number.isNaN(k))) return k;
  throw new CITError(`Dictionary keys must be strings, numbers or booleans, not ${typeOf(k)}.`, tok.line, tok.column);
}

class Env {
  constructor(parent = null) {
    this.parent = parent;
    this.values = new Map();
    this.className = parent?.className || null;
    this.accessorName = parent?.accessorName || null;
    this.functionId = parent?.functionId || null;
  }
  find(n) { if (this.values.has(n)) return this; return this.parent ? this.parent.find(n) : null; }
  binding(n) { const e = this.find(n); return e ? e.values.get(n) : null; }
  get(n, tok) {
    const e = this.find(n);
    if (!e) throw new CITError(`Undefined variable '${n}'.`, tok?.line || 1, tok?.column || 1);
    const binding = e.values.get(n);
    if (binding.fieldAccess) {
      let context = this, className = null;
      while (context && !className) { className = context.className || null; context = context.parent; }
      const owner = binding.fieldAccess.owner;
      const chain = e.instance?.__classChain || [];
      const allowed = binding.fieldAccess.visibility === 'private'
        ? className === owner
        : className !== null && chain.includes(className) && chain.includes(owner);
      if (!allowed) throw new CITError(`Cannot access ${binding.fieldAccess.visibility} field '${n}' outside its class.`, tok?.line || 1, tok?.column || 1);
    }
    if (binding.temporal) {
      const temporal = binding.temporal;
      const now = Date.now();
      const constraints = temporal.constraints || [temporal];
      let expired = constraints.some(constraint => constraint.unit === 's'
        ? constraint.mode === 'offline'
          ? now - temporal.lastUsedAt >= constraint.amount * 1000
          : constraint.mode === 'stopUse' ? false : now >= constraint.expiresAt
        : constraint.unit === 'l'
          ? (tok?.line || 1) > constraint.expiresLine
          : constraint.remainingReads <= 0);
      if (temporal.mode === 'stopUse' && typeof temporal.isIdle === 'function') {
        if (temporal.isIdle()) {
          temporal.idleSince ??= now;
          expired ||= now - temporal.idleSince >= temporal.amount * 1000;
        } else temporal.idleSince = null;
      }
      if (expired) {
        e.values.delete(n);
        throw new CITError(`Temporal variable '${n}' has expired.`, tok?.line || 1, tok?.column || 1);
      }
      for (const constraint of constraints) if (constraint.unit === 'r') constraint.remainingReads--;
      if (temporal.mode === 'offline') temporal.lastUsedAt = now;
    }
    return binding.value;
  }
  define(n, v, mutable = true, type = typeOf(v), tok = { line: 1, column: 1 }, temporal = null, width = null) {
    if (this.values.has(n)) throw new CITError(`'${n}' is already declared.`, tok.line, tok.column);
    const b = { value: v, mutable, type, temporal, width };
    this.values.set(n, b);
    return b;
  }
  async set(n, v, tok = { line: 1, column: 1 }) {
    const e = this.find(n);
    if (!e) throw new CITError(`Undefined variable '${n}'.`, tok.line, tok.column);
    this.get(n, tok);
    const x = e.values.get(n);
    if (!x.mutable) throw new CITError(`Cannot reassign immutable variable '${n}'. Use 'let mut'.`, tok.line, tok.column);
    const previous = x.value;
    if (x.type === 'null') {
      x.type = typeOf(v);                       // an empty variable takes the type of its first value
    } else if (v === null && x.type === 'object') {
      // an object variable may be set back to null (works together with ?.)
    } else if ((x.type === 'int' || x.type === 'float') && typeof v === 'number') {
      x.type = x.type === 'float' || !Number.isInteger(v) ? 'float' : 'int';   // numbers can widen to float
    } else {
      checked(v, x.type, tok);
    }
    if (x.width) v = castWidth(v, x.width, tok);
    x.value = v;
    if (x.watchers?.length && !valuesEqual(previous, v)) {
      for (const watcher of [...x.watchers]) await watcher(v, previous);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Methods of lists, dictionaries and strings                          */
/* ------------------------------------------------------------------ */

const needInt = (v, what, c) => { if (!Number.isInteger(v)) throw c.err(`${what} must be an integer.`); return v; };
const needStr = (v, what, c) => { if (typeof v !== 'string') throw c.err(`${what} must be a string.`); return v; };
const needFn = (v, name, c) => {
  if (!(v && v.kind === 'function') && typeof v !== 'function') throw c.err(`${name}() needs a function, for example ${name}(x => x * 2).`);
  return v;
};
// slice bounds with JavaScript rules: negative numbers count from the end, results are clamped
function sliceBounds(len, start, end, c, name) {
  if (start !== undefined) needInt(start, `${name}() start`, c);
  if (end !== undefined && end !== null) needInt(end, `${name}() end`, c);
  const s = start === undefined ? 0 : start < 0 ? Math.max(0, len + start) : Math.min(start, len);
  const e = end === undefined || end === null ? len : end < 0 ? Math.max(0, len + end) : Math.min(end, len);
  return [s, e];
}
const MAX_TEXT = 1000000;

const LIST_METHODS = {
  append:  { mutates: true, min: 1, max: 1, run: (l, [x]) => { l.push(x); return null; } },
  pop:     { mutates: true, min: 0, max: 1, run: (l, [i], c) => {
    if (!l.length) throw c.err('Cannot pop from an empty list.');
    let k = l.length - 1;
    if (i !== undefined) {
      needInt(i, 'pop() index', c);
      k = i < 0 ? i + l.length : i;
      if (k < 0 || k >= l.length) throw c.err(`pop index ${i} is out of range for a list of length ${l.length}.`);
    }
    return l.splice(k, 1)[0];
  } },
  insert:  { mutates: true, min: 2, max: 2, run: (l, [i, x], c) => {
    needInt(i, 'insert() index', c);
    l.splice(i < 0 ? Math.max(0, l.length + i) : Math.min(i, l.length), 0, x);
    return null;
  } },
  clear:   { mutates: true, min: 0, max: 0, run: l => { l.length = 0; return null; } },
  remove:  { mutates: true, min: 1, max: 1, run: (l, [x], c) => {
    const k = l.findIndex(y => valuesEqual(y, x));
    if (k < 0) throw c.err(`remove(): ${format(x, true)} is not in the list.`);
    l.splice(k, 1);
    return null;
  } },
  reverse: { mutates: true, min: 0, max: 0, run: l => { l.reverse(); return null; } },
  count:   { min: 1, max: 1, run: (l, [x]) => l.filter(y => valuesEqual(y, x)).length },
  index:   { min: 1, max: 1, run: (l, [x], c) => {
    const k = l.findIndex(y => valuesEqual(y, x));
    if (k < 0) throw c.err(`index(): ${format(x, true)} is not in the list.`);
    return k;
  } },
  copy:    { min: 0, max: 0, run: l => l.slice() },
  // removes `deleteCount` items at `start` (default: everything after start), inserts the extra values, returns the removed items
  splice:  { mutates: true, min: 1, max: Infinity, run: (l, a, c) => {
    needInt(a[0], 'splice() start', c);
    if (a.length > 1) needInt(a[1], 'splice() delete count', c);
    const s = a[0] < 0 ? Math.max(0, l.length + a[0]) : Math.min(a[0], l.length);
    const d = a.length < 2 ? l.length - s : Math.max(0, Math.min(a[1], l.length - s));
    return l.splice(s, d, ...a.slice(2));
  } },
  unshift: { mutates: true, min: 1, max: Infinity, run: (l, a) => { l.unshift(...a); return l.length; } },
  shift:   { mutates: true, min: 0, max: 0, run: (l, a, c) => {
    if (!l.length) throw c.err('Cannot shift from an empty list.');
    return l.shift();
  } },
  map:     { min: 1, max: 1, run: async (l, [f], c) => {
    needFn(f, 'map', c);
    const items = l.slice(), out = [];
    for (let i = 0; i < items.length; i++) out.push(await c.call(f, items[i], i));
    return out;
  } },
  filter:  { min: 1, max: 1, run: async (l, [f], c) => {
    needFn(f, 'filter', c);
    const items = l.slice(), out = [];
    for (let i = 0; i < items.length; i++) if (truthy(await c.call(f, items[i], i))) out.push(items[i]);
    return out;
  } },
  reduce:  { min: 1, max: 2, run: async (l, a, c) => {
    needFn(a[0], 'reduce', c);
    const items = l.slice();
    let acc, i = 0;
    if (a.length > 1) acc = a[1];
    else {
      if (!items.length) throw c.err('reduce() of an empty list needs a starting value: list.reduce(fn, start).');
      acc = items[0]; i = 1;
    }
    for (; i < items.length; i++) acc = await c.call(a[0], acc, items[i], i);
    return acc;
  } },
  slice:   { min: 0, max: 2, run: (l, [a, b], c) => { const [s, e] = sliceBounds(l.length, a, b, c, 'slice'); return l.slice(s, e); } },
  include: { min: 1, max: 1, run: (l, [x]) => l.some(y => valuesEqual(y, x)) },
  find:    { min: 1, max: 1, run: async (l, [f], c) => {
    needFn(f, 'find', c);
    const items = l.slice();
    for (let i = 0; i < items.length; i++) if (truthy(await c.call(f, items[i], i))) return items[i];
    return null;
  } },
  flat:    { min: 0, max: 1, run: (l, [depth = 1], c) => {
    if (!Number.isInteger(depth) || depth < 0) throw c.err('flat() depth must be a non-negative integer.');
    const flatten = (items, remaining) => items.flatMap(item => Array.isArray(item) && remaining > 0 ? flatten(item, remaining - 1) : [item]);
    return flatten(l, depth);
  } },
  shuffle: { min: 0, max: 0, run: (l, a, c) => {
    const out = l.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(c.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  } },
  chunk:   { min: 1, max: 1, run: (l, [size], c) => {
    needInt(size, 'chunk() size', c);
    if (size <= 0) throw c.err('chunk() size must be greater than 0.');
    const chunks = [];
    for (let i = 0; i < l.length; i += size) chunks.push(l.slice(i, i + size));
    return chunks;
  } }
};

const DICT_METHODS = {
  clear:    { mutates: true, min: 0, max: 0, run: d => { d.clear(); return null; } },
  get:      { min: 1, max: 2, run: (d, [k, fallback = null], c) => (d.has(dictKey(k, c.tok)) ? d.get(k) : fallback) },
  keys:     { min: 0, max: 0, run: d => [...d.keys()] },
  values:   { min: 0, max: 0, run: d => [...d.values()] },
  items:    { min: 0, max: 0, run: d => [...d].map(([k, v]) => [k, v]) },
  update:   { mutates: true, min: 1, max: 1, run: (d, [other], c) => {
    if (other instanceof Map) { for (const [k, v] of other) d.set(k, v); return null; }
    if (Array.isArray(other)) {
      for (const p of other) {
        if (!Array.isArray(p) || p.length !== 2) throw c.err('update() needs a dictionary or a list of [key, value] pairs.');
        d.set(dictKey(p[0], c.tok), p[1]);
      }
      return null;
    }
    throw c.err('update() needs a dictionary or a list of [key, value] pairs.');
  } },
  pop:      { mutates: true, min: 1, max: 2, run: (d, a, c) => {
    const k = dictKey(a[0], c.tok);
    if (d.has(k)) { const v = d.get(k); d.delete(k); return v; }
    if (a.length > 1) return a[1];
    throw c.err(`pop(): key ${format(k, true)} was not found.`);
  } },
  popitem:  { mutates: true, min: 0, max: 0, run: (d, a, c) => {
    if (!d.size) throw c.err('Cannot popitem from an empty dictionary.');
    const [k, v] = [...d].pop();
    d.delete(k);
    return [k, v];
  } },
  // sets the key to `value` only if the key is missing, then returns the key's value
  default:  { mutates: true, min: 1, max: 2, run: (d, [k, v = null], c) => { dictKey(k, c.tok); if (!d.has(k)) d.set(k, v); return d.get(k); } },
  copy:     { min: 0, max: 0, run: d => new Map(d) },
  // builds a NEW dictionary whose keys come from a list; every key gets the same value
  fromkeys: { min: 1, max: 2, run: (d, [keys, v = null], c) => {
    if (!Array.isArray(keys)) throw c.err('fromkeys() needs a list of keys.');
    const out = new Map();
    for (const k of keys) out.set(dictKey(k, c.tok), v);
    return out;
  } }
};

const padText = (s, len, fill, atStart, c, name) => {
  needInt(len, `${name}() length`, c);
  needStr(fill, `${name}() fill`, c);
  if (len > MAX_TEXT) throw c.err(`${name}() length is too large.`);
  const need = len - [...s].length, f = [...fill];
  if (need <= 0 || !f.length) return s;
  let pad = '';
  for (let i = 0; i < need; i++) pad += f[i % f.length];
  return atStart ? pad + s : s + pad;
};

const STRING_METHODS = {
  include:   { min: 1, max: 1, run: (s, [x], c) => s.includes(needStr(x, 'include() value', c)) },
  ends:      { min: 1, max: 1, run: (s, [x], c) => s.endsWith(needStr(x, 'ends() value', c)) },
  starts:    { min: 1, max: 1, run: (s, [x], c) => s.startsWith(needStr(x, 'starts() value', c)) },
  slice:     { min: 0, max: 2, run: (s, [a, b], c) => { const ch = [...s]; const [i, j] = sliceBounds(ch.length, a, b, c, 'slice'); return ch.slice(i, j).join(''); } },
  substring: { min: 1, max: 2, run: (s, [a, b], c) => {
    const ch = [...s], n = ch.length;
    needInt(a, 'substring() start', c);
    if (b !== undefined) needInt(b, 'substring() end', c);
    let i = Math.min(Math.max(a, 0), n), j = b === undefined ? n : Math.min(Math.max(b, 0), n);
    if (i > j) [i, j] = [j, i];
    return ch.slice(i, j).join('');
  } },
  // split() with no separator splits on whitespace; split("") gives single characters
  split:     { min: 0, max: 1, run: (s, [sep], c) => {
    if (sep === undefined) return s.trim() === '' ? [] : s.trim().split(/\s+/);
    needStr(sep, 'split() separator', c);
    return sep === '' ? [...s] : s.split(sep);
  } },
  lower:     { min: 0, max: 0, run: s => s.toLowerCase() },
  upper:     { min: 0, max: 0, run: s => s.toUpperCase() },
  trim:      { min: 0, max: 0, run: s => s.trim() },
  replace:   { min: 2, max: 2, run: (s, [a, b], c) => {      // first match only
    needStr(a, 'replace() search value', c); needStr(b, 'replace() new value', c);
    if (a === '') throw c.err('replace() search value cannot be empty.');
    const k = s.indexOf(a);
    return k < 0 ? s : s.slice(0, k) + b + s.slice(k + a.length);
  } },
  replaceAll: { min: 2, max: 2, run: (s, [a, b], c) => {
    needStr(a, 'replaceAll() search value', c); needStr(b, 'replaceAll() new value', c);
    if (a === '') throw c.err('replaceAll() search value cannot be empty.');
    return s.split(a).join(b);
  } },
  startPad:  { min: 1, max: 2, run: (s, [n, fill = ' '], c) => padText(s, n, fill, true, c, 'startPad') },
  endPad:    { min: 1, max: 2, run: (s, [n, fill = ' '], c) => padText(s, n, fill, false, c, 'endPad') },
  repeat:    { min: 1, max: 1, run: (s, [n], c) => {
    needInt(n, 'repeat() count', c);
    if (n < 0) throw c.err('repeat() count cannot be negative.');
    if (s.length * n > MAX_TEXT) throw c.err('repeat() result is too large.');
    return s.repeat(n);
  } },
  at:        { min: 1, max: 1, run: (s, [i], c) => { const ch = [...s]; needInt(i, 'at() index', c); const k = i < 0 ? i + ch.length : i; return k >= 0 && k < ch.length ? ch[k] : null; } },
  charAt:    { min: 1, max: 1, run: (s, [i], c) => { const ch = [...s]; needInt(i, 'charAt() index', c); return i >= 0 && i < ch.length ? ch[i] : ''; } },
  charCodeAt: { min: 1, max: 1, run: (s, [i], c) => { const ch = [...s]; needInt(i, 'charCodeAt() index', c); return i >= 0 && i < ch.length ? ch[i].codePointAt(0) : null; } },
  indexOf:   { min: 1, max: 2, run: (s, [x, from = 0], c) => {   // -1 when not found
    needStr(x, 'indexOf() value', c); needInt(from, 'indexOf() start', c);
    const start = [...s].slice(0, Math.max(0, from)).join('').length;
    const k = s.indexOf(x, start);
    return k < 0 ? -1 : [...s.slice(0, k)].length;
  } },
  isNumeric: { min: 0, max: 0, run: s => s.trim() !== '' && Number.isFinite(Number(s)) },
  capitalize: { min: 0, max: 0, run: s => {
    const chars = [...s];
    return chars.length ? chars[0].toLocaleUpperCase() + chars.slice(1).join('') : '';
  } }
};

const TUPLE_METHODS = {
  ...Object.fromEntries(Object.entries(LIST_METHODS).filter(([, method]) => !method.mutates))
};

const SET_METHODS = {
  add: { mutates: true, min: 1, max: 1, run: (set, [value]) => { set.add(value); return null; } },
  update: { mutates: true, min: 1, max: Infinity, run: (set, values, c) => {
    for (const value of values) {
      if (value instanceof Set || Array.isArray(value) || typeof value === 'string') for (const item of value) set.add(item);
      else throw c.err('set.update() values must be sets, lists or strings.');
    }
    return null;
  } },
  intersectionUpdate: { mutates: true, min: 1, max: 1, run: (set, [other], c) => {
    if (!(other instanceof Set)) throw c.err('intersectionUpdate() needs a set.');
    for (const value of set) if (!other.has(value)) set.delete(value);
    return null;
  } },
  differenceUpdate: { mutates: true, min: 1, max: 1, run: (set, [other], c) => {
    if (!(other instanceof Set)) throw c.err('differenceUpdate() needs a set.');
    for (const value of other) set.delete(value);
    return null;
  } },
  symmetricDifferenceUpdate: { mutates: true, min: 1, max: 1, run: (set, [other], c) => {
    if (!(other instanceof Set)) throw c.err('symmetricDifferenceUpdate() needs a set.');
    for (const value of other) { if (set.has(value)) set.delete(value); else set.add(value); }
    return null;
  } },
  isSubSet: { min: 1, max: 1, run: (set, [other], c) => {
    if (!(other instanceof Set)) throw c.err('isSubSet() needs a set.');
    return [...set].every(value => other.has(value));
  } },
  isSuperSet: { min: 1, max: 1, run: (set, [other], c) => {
    if (!(other instanceof Set)) throw c.err('isSuperSet() needs a set.');
    return [...other].every(value => set.has(value));
  } },
  remove: { mutates: true, min: 1, max: 1, run: (set, [value], c) => {
    if (!set.delete(value)) throw c.err(`remove(): ${format(value, true)} is not in the set.`);
    return null;
  } },
  discard: { mutates: true, min: 1, max: 1, run: (set, [value]) => { set.delete(value); return null; } },
  pop: { mutates: true, min: 0, max: 0, run: (set, values, c) => {
    if (!set.size) throw c.err('Cannot pop from an empty set.');
    const value = set.values().next().value;
    set.delete(value);
    return value;
  } },
  clear: { mutates: true, min: 0, max: 0, run: set => { set.clear(); return null; } },
  copy: { min: 0, max: 0, run: set => new Set(set) },
  count: { min: 1, max: 1, run: (set, [value]) => set.has(value) ? 1 : 0 }
};

// toFixed(2) rounds to 2 digits after the point and gives back a number: 8.2222 -> 8.22
const NUMBER_METHODS = {
  toFixed: { min: 0, max: 1, run: (n, [d = 0], c) => {
    needInt(d, 'toFixed() digits', c);
    if (d < 0 || d > 20) throw c.err('toFixed() digits must be between 0 and 20.');
    return Number(n.toFixed(d));
  } }
};

const BUILTINS = new Set(['input', 'castInt', 'castFloat', 'castString', 'castBool', 'range', 'min', 'max', 'sum', 'len', 'random', 'randint', 'list', 'tuple', 'set', 'dict', 'frozendict', 'frozenset', 'object', 'bin', 'zip', 'enumerate', 'enumarate', 'round', 'id', 'type', 'isinstance', 'issubclass', 'square', 'printf', 'exchange', 'sleep', 'open', 'union', 'intersection', 'difference', 'symmetricDifference', 'longString', 'longNumber', 'hex', 'hsl', 'hsv', 'rgb', 'rgba', 'clr']);

/* ------------------------------------------------------------------ */
/* Interpreter                                                         */
/* ------------------------------------------------------------------ */

async function run(source, output = () => {}, input = async prompt => '', options = {}) {
  const ast = options.ast || new Parser(tokenize(source)).parse();
  const global = new Env();
  global.defers = [];
  const rand = options.random || Math.random;
  const maxSteps = options.maxSteps || 1000000;
  let steps = 0;
  const fatal = msg => { const e = new CITError(msg); e.fatal = true; return e; };     // try/catch cannot catch these
  const tick = (msg = 'Execution step limit exceeded. Possible infinite loop.') => { if (++steps > maxSteps) throw fatal(msg); };
  const emit = (kind, msg) => {
    const line = String(msg);
    if (kind === 'errorln') output(`[ERROR] ${line}`, 'error');
    else if (kind === 'warnln') output(`[WARNING] ${line}`, 'warn');
    else if (kind === 'print') output(line, 'print');
    else output(line, 'out');
  };
  const cancelled = () => typeof options.isCancelled === 'function' && options.isCancelled();
  let currentDir = options.baseDir || null;
  const moduleCache = new Map(), loading = new Set();
  const SHORT = Symbol('short-circuit');      // result of a ?. chain that hit null
  const startedAt = Date.now();
  global.define('task', { wait: seconds => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new CITError('task.wait() needs a non-negative number of seconds.');
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  } }, false, 'module');
  let nextObjectId = 1;
  let nextFunctionId = 1;
  const objectIds = new WeakMap(), primitiveIds = new Map();

  /* ---- expressions ---- */

  async function ev(e, env) { const v = await evx(e, env); return v === SHORT ? null : v; }

  async function evx(e, env) {
    switch (e.kind) {
      case 'literal': return e.litType === 'template' ? interpolate(e.value, env) : e.value;
      case 'variable': return env.get(e.name, e.token);
      case 'conditional': return truthy(await ev(e.condition, env)) ? ev(e.test, env) : ev(e.otherwise, env);
      case 'conditionalBlock': return evalBlockValue(truthy(await ev(e.condition, env)) ? e.yes : e.no, env);
      case 'list': { const out = []; for (const item of e.items) out.push(await ev(item, env)); return out; }
      case 'tree': return [await ev(e.root, env), [await ev(e.child, env)]];
      case 'tuple': {
        const out = [];
        for (const item of e.items) out.push(await ev(item, env));
        Object.defineProperty(out, TUPLE, { value: true });
        Object.freeze(out);
        return out;
      }
      case 'set': { const out = new Set(); for (const item of e.items) out.add(await ev(item, env)); return out; }
      case 'dict': {
        const d = new Map();
        for (const en of e.entries) d.set(dictKey(await ev(en.key, env), en.key.token), await ev(en.value, env));
        return d;
      }
      case 'pattern': return e;
      case 'lambda': {
        const fn = { kind: 'function', name: e.name, params: e.params, body: e.body, closure: env };
        if (e.name) { const own = new Env(env); own.define(e.name, fn, false, 'function'); fn.closure = own; }   // lets it call itself
        return fn;
      }
      case 'index': {
        const o = await evx(e.object, env);
        if (o === SHORT) return SHORT;
        return readIndex(o, await indexValue(e.index, env, o), e.token);
      }
      case 'slice': {
        const o = await ev(e.object, env);
        if (!Array.isArray(o) && typeof o !== 'string') throw new CITError(`Only lists and strings can be sliced, not ${typeOf(o)}.`, e.token.line, e.token.column);
        const start = e.start ? await ev(e.start, env) : undefined;
        const end = e.end ? await ev(e.end, env) : undefined;
        const step = e.step ? await ev(e.step, env) : 1;
        if (!Number.isInteger(step) || step === 0) throw new CITError('A slice step must be a non-zero integer.', e.token.line, e.token.column);
        const items = typeof o === 'string' ? [...o] : o;
        const [from, to] = sliceBounds(items.length, start, end, { err: msg => new CITError(msg, e.token.line, e.token.column) }, 'slice');
        const selected = [];
        if (step > 0) for (let i = from; i < to; i += step) selected.push(items[i]);
        else {
          let i = start === undefined ? items.length - 1 : (start < 0 ? items.length + start : start);
          const stop = end === undefined ? -1 : (end < 0 ? items.length + end : end);
          for (; i > stop; i += step) if (i >= 0 && i < items.length) selected.push(items[i]);
        }
        return typeof o === 'string' ? selected.join('') : selected;
      }
      case 'member': {
        const o = await evx(e.object, env);
        if (o === SHORT) return SHORT;
        if (e.optional && (o === null || o === undefined)) return SHORT;
        return readMember(o, e, env);
      }
      case 'update': return update(e, env);
      case 'await': return ev(e.expr, env);
      case 'unary': {
        const v = await ev(e.expr, env);
        if (e.op === '!') return !truthy(v);
        if (typeof v !== 'number') throw new CITError(`Unary '${e.op}' requires a number.`);
        return e.op === '-' ? -v : v;
      }
      case 'binary': {
        if (e.op === 'in') return inOperator(e, env);
        const a = await ev(e.left, env);
        if (e.op === '&&') return truthy(a) && truthy(await ev(e.right, env));
        if (e.op === '||') return truthy(a) || truthy(await ev(e.right, env));
        if (e.op === '??') return a === null || a === undefined ? ev(e.right, env) : a;
        const b = await ev(e.right, env);
        if (typeof a?.__operators?.[e.op] === 'function') return await a.__operators[e.op](b);
        return binaryOp(e.op, a, b, e.token);
      }
      case 'oneOf': {
        const subject = await ev(e.subject, env);
        for (const candidate of e.candidates) {
          const equal = valuesEqual(subject, await ev(candidate, env));
          if (e.op === '==' ? equal : !equal) {
            if (e.op === '==') return true;
          } else if (e.op === '!=') return false;
        }
        return e.op === '!=';
      }
      case 'call': return call(e, env);
      default: throw new CITError('Invalid expression.');
    }
  }

  async function evalBlockValue(body, parent) {
    const env = new Env(parent);
    let value = null;
    for (const statement of body) {
      if (statement.kind === 'expr') value = await ev(statement.expr, env);
      else {
        const result = await exec([statement], env);
        if (result?.type === RETURN) return result.value;
        if (result) return null;
      }
    }
    return value;
  }

  // value in text / list / dictionary
  async function inOperator(e, env) {
    const tok = e.token;
    const fail = msg => new CITError(msg, tok.line, tok.column);
    let a, b;
    if (e.left.kind === 'variable' && !env.find(e.left.name)) {       // name in info  ->  "name" in info
      b = await ev(e.right, env);
      if (!(b instanceof Map)) throw new CITError(`Undefined variable '${e.left.name}'.`, e.left.token.line, e.left.token.column);
      return b.has(e.left.name);
    }
    a = await ev(e.left, env);
    b = await ev(e.right, env);
    if (typeof b === 'string') {
      if (typeof a !== 'string') throw fail(`'in' needs text on the left side when searching inside a string (got ${typeOf(a)}).`);
      return b.includes(a);
    }
    if (Array.isArray(b)) return b.some(x => valuesEqual(x, a));
    if (b instanceof Map) return (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') && b.has(a);
    if (b instanceof Set) return [...b].some(x => valuesEqual(x, a));
    throw fail(`'in' needs a string, list, set or dictionary on the right side, not ${typeOf(b)}.`);
  }

  // In info[name], a bare name that is not a variable is used as the key "name".
  async function indexValue(indexExpr, env, container) {
    if (container instanceof Map && indexExpr.kind === 'variable' && !env.find(indexExpr.name)) return indexExpr.name;
    return ev(indexExpr, env);
  }

  function binaryOp(op, a, b, tok = { line: 1, column: 1 }) {
    const fail = msg => new CITError(msg, tok.line, tok.column);
    if (op === '==') return valuesEqual(a, b);
    if (op === '!=') return !valuesEqual(a, b);
    if (['|', '&', '^', '-'].includes(op) && a instanceof Set && b instanceof Set) {
      if (op === '|') return new Set([...a, ...b]);
      if (op === '&') return new Set([...a].filter(value => b.has(value)));
      if (op === '^') return new Set([...a].filter(value => !b.has(value)).concat([...b].filter(value => !a.has(value))));
      return new Set([...a].filter(value => !b.has(value)));
    }
    if (['<=', '<', '>=', '>'].includes(op) && a instanceof Set && b instanceof Set) {
      const subset = [...a].every(value => b.has(value));
      const superset = [...b].every(value => a.has(value));
      return op === '<=' ? subset : op === '<' ? subset && a.size < b.size : op === '>=' ? superset : superset && a.size > b.size;
    }
    if (op === '+') {
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      throw fail(`Invalid operands for '+' (${typeOf(a)} and ${typeOf(b)}).`);
    }
    if (['-', '*', '/', '//', '%', '**'].includes(op) && (typeof a !== 'number' || typeof b !== 'number')) {
      throw fail(`Invalid operands for '${op}' (${typeOf(a)} and ${typeOf(b)}); both values must be numbers.`);
    }
    if (['<', '>', '<=', '>='].includes(op)
      && !((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) {
      throw fail(`Invalid operands for '${op}' (${typeOf(a)} and ${typeOf(b)}); compare two numbers or two strings.`);
    }
    if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object') || typeof a === 'function' || typeof b === 'function') {
      throw fail(`Invalid operands for '${op}' (${typeOf(a)} and ${typeOf(b)}).`);
    }
    switch (op) {
      case '-': return a - b;
      case '*': return a * b;
      case '/': if (b === 0) throw fail('Division by zero.'); return a / b;
      case '//': if (b === 0) throw fail('Division by zero.'); return Math.floor(a / b);
      case '%': if (b === 0) throw fail('Division by zero.'); return ((a % b) + b) % b;
      case '**': return a ** b;
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
    }
    throw fail(`Invalid operands for '${op}'.`);
  }

  function readIndex(o, i, tok = { line: 1, column: 1 }) {
    const fail = msg => new CITError(msg, tok.line, tok.column);
    if (o instanceof Map) {
      dictKey(i, tok);
      if (!o.has(i)) throw fail(`Key ${format(i, true)} was not found in the dictionary. Use d.get(key) to avoid this error.`);
      return o.get(i);
    }
    const isList = Array.isArray(o);
    if (!isList && typeof o !== 'string') throw fail(`Only lists, strings and dictionaries can be indexed, not ${typeOf(o)}.`);
    if (!Number.isInteger(i)) throw fail('An index must be an integer.');
    const items = isList ? o : [...o];
    const k = i < 0 ? i + items.length : i;
    if (k < 0 || k >= items.length) throw fail(`Index ${i} is out of range for a ${isList ? 'list' : 'string'} of length ${items.length}.`);
    return items[k];
  }

  function canAccessField(o, access, env) {
    let frame = env, className = null;
    while (frame && !className) { className = frame.className || null; frame = frame.parent; }
    const chain = o.__classChain || [];
    return access.visibility === 'private'
      ? className === access.owner
      : className !== null && chain.includes(className) && chain.includes(access.owner);
  }

  async function readMember(o, e, env) {
    const tok = e.token || { line: 1, column: 1 };
    if (o === null || o === undefined) throw new CITError(`Cannot read '${e.name}' from null. Use ?. to skip null values (value?.${e.name}).`, tok.line, tok.column);
    if (Array.isArray(o)) {
      if (hasOwn(LIST_METHODS, e.name)) throw new CITError(`'${e.name}' is a list method. Call it like list.${e.name}(...).`, tok.line, tok.column);
      throw new CITError(`Lists have no property '${e.name}'.`, tok.line, tok.column);
    }
    if (o instanceof Map) {
      if (hasOwn(DICT_METHODS, e.name)) throw new CITError(`'${e.name}' is a dictionary method. Call it like d.${e.name}(...).`, tok.line, tok.column);
      throw new CITError(`Dictionaries use d["${e.name}"] (or d[${e.name}]) to read a key, not d.${e.name}.`, tok.line, tok.column);
    }
    if (typeof o === 'number' && hasOwn(NUMBER_METHODS, e.name)) throw new CITError(`'${e.name}' is a number method. Call it like n.${e.name}(...).`, tok.line, tok.column);
    if (typeof o === 'string' && hasOwn(STRING_METHODS, e.name)) throw new CITError(`'${e.name}' is a string method. Call it like s.${e.name}(...).`, tok.line, tok.column);
    if (typeof o !== 'object') throw new CITError(`Cannot read '${e.name}' from a ${typeOf(o)}.`, tok.line, tok.column);
    const access = FIELD_ACCESS.get(o)?.get(e.name);
    if (access && !o.__getters?.[e.name] && !canAccessField(o, access, env)) throw new CITError(`Cannot access ${access.visibility} field '${e.name}' outside its class.`, tok.line, tok.column);
    if (o.__module && !hasOwn(o, e.name)) throw new CITError(`Module '${o.__module}' has no export '${e.name}'.`, tok.line, tok.column);
    if (o.__getters?.[e.name] && env.accessorName !== e.name) return await o.__getters[e.name]();
    return hasOwn(o, e.name) ? o[e.name] : null;
  }

  // Lists and dictionaries declared with plain `let` (not `let mut`) cannot be changed through that variable.
  function requireMutable(objExpr, env, action, tok) {
    if (objExpr.kind !== 'variable') return;
    const b = env.binding(objExpr.name);
    if (b && READONLY.has(b.value)) throw new CITError(`Cannot ${action} '${objExpr.name}' because it is read-only.`, tok.line, tok.column);
    if (b && b.value && b.value[TUPLE]) throw new CITError(`Cannot ${action} '${objExpr.name}' because tuples are immutable.`, tok.line, tok.column);
    if (b && b.value instanceof Set && READONLY.has(b.value)) throw new CITError(`Cannot ${action} '${objExpr.name}' because it is read-only.`, tok.line, tok.column);
    if (b && !b.mutable && !b.param) {
      throw new CITError(`Cannot ${action} '${objExpr.name}' because it was declared with 'let'. Use 'let mut ${objExpr.name}'.`, tok.line, tok.column);
    }
  }

  // Braces in a template string are expressions, not literal text.
  async function interpolate(s, env) {
    let result = '', i = 0;
    while (i < s.length) {
      if (s[i] === '{') {
        const end = s.indexOf('}', i + 1);
        if (end >= 0) {
          const interpolation = s.slice(i + 1, end);
          const formatMatch = interpolation.match(/^(.*):\.(\d+)f$/s);
          const expression = formatMatch ? formatMatch[1] : interpolation;
          const value = await ev(new Parser(tokenize(expression)).expression(), env);
          if (formatMatch) {
            if (typeof value !== 'number') throw new CITError('A floating-point template format needs a number.');
            result += value.toFixed(Number(formatMatch[2]));
          } else result += format(value);
          i = end + 1;
          continue;
        }
      }
      result += s[i++];
    }
    return result;
  }

  /* ---- calls ---- */

  async function call(e, env) {
    const callee = e.callee;

    if (callee.kind === 'member') {
      const obj = await evx(callee.object, env);
      if (obj === SHORT) return SHORT;
      const tok = callee.token || { line: 1, column: 1 };
      if (callee.optional && (obj === null || obj === undefined)) return SHORT;     // p?.talk()
      if (obj?.__module === 'datetime' && callee.name === 'benchmark') {
        if (e.args.length !== 1) throw new CITError('datetime.benchmark() needs one function.', tok.line, tok.column);
        const callback = await ev(e.args[0].value, env);
        if (!(callback && callback.kind === 'function') && typeof callback !== 'function') throw new CITError('datetime.benchmark() needs a function.', tok.line, tok.column);
        const start = process.hrtime.bigint();
        const result = await callValue(callback, [], env, 'callback', tok);
        return { result, durationMs: Number(process.hrtime.bigint() - start) / 1e6 };
      }
      if (obj?.__module === 'json' && ['dumps', 'dump', 'stringify'].includes(callee.name)) {
        const values = [];
        const named = Object.create(null);
        for (const arg of e.args) {
          const value = await ev(arg.value, env);
          if (arg.name) {
            if (hasOwn(named, arg.name)) throw new CITError(`JSON option '${arg.name}' was supplied more than once.`, tok.line, tok.column);
            named[arg.name] = value;
          }
          else values.push(value);
        }
        const dump = callee.name === 'dump';
        const wanted = dump ? 2 : 1;
        if (values.length !== wanted) throw new CITError(`json.${callee.name}() needs ${wanted} positional value${wanted === 1 ? '' : 's'}.`, tok.line, tok.column);
        const unknownOption = Object.keys(named).find(option => !['indent', 'sortKeys'].includes(option));
        if (unknownOption) throw new CITError(`json.${callee.name}() has no option '${unknownOption}'.`, tok.line, tok.column);
        const indent = named.indent === undefined ? 0 : named.indent;
        if (!Number.isInteger(indent) || indent < 0 || indent > 10) throw new CITError('JSON indent must be an integer from 0 to 10.', tok.line, tok.column);
        if (named.sortKeys !== undefined && typeof named.sortKeys !== 'boolean') throw new CITError('JSON sortKeys must be a boolean.', tok.line, tok.column);
        let value;
        try {
          const jsonValue = toJsonValue(values[0]);
          const ordered = named.sortKeys ? sortJsonKeys(jsonValue) : jsonValue;
          value = JSON.stringify(ordered, null, indent);
        } catch (cause) { throw new CITError(`json.${callee.name}(): ${cause.message}`, tok.line, tok.column); }
        if (dump) {
          if (!values[1] || typeof values[1].write !== 'function') throw new CITError('json.dump(value, file) needs a writable file.', tok.line, tok.column);
          values[1].write(value);
          return null;
        }
        return value;
      }
      if (Array.isArray(obj) && obj[TUPLE]) return invokeMethod(obj, 'tuple', 'Tuples', TUPLE_METHODS, e, env);
      if (Array.isArray(obj)) return invokeMethod(obj, 'list', 'Lists', LIST_METHODS, e, env);
      if (obj instanceof Map) return invokeMethod(obj, 'dictionary', 'Dictionaries', DICT_METHODS, e, env);
      if (obj instanceof Set) return invokeMethod(obj, 'set', 'Sets', SET_METHODS, e, env);
      if (typeof obj === 'string') return invokeMethod(obj, 'string', 'Strings', STRING_METHODS, e, env);
      if (typeof obj === 'number') return invokeMethod(obj, 'number', 'Numbers', NUMBER_METHODS, e, env);
      if (obj === null || obj === undefined) {
        throw new CITError(`Cannot call '${callee.name}' because the value is null. Use ?. for a safe call (value?.${callee.name}()).`, tok.line, tok.column);
      }
      if (typeof obj !== 'object' || !hasOwn(obj, callee.name) || typeof obj[callee.name] !== 'function') {
        throw new CITError(`'${callee.name}' is not a method.`, tok.line, tok.column);
      }
      const vals = [];
      for (const a of e.args) vals.push(await ev(a.value, env));
      return await obj[callee.name](...vals);
    }

    if (callee.kind === 'variable') {
      if (callee.name === 'exchange' && e.args.length === 2) {
        const target = await resolveTarget(e.args[0].value, env);
        const previous = target.get(), replacement = await ev(e.args[1].value, env);
        await target.set(replacement);
        return previous;
      }
      if (callee.name === 'isinstance' && e.args.length === 2 && !env.find('isinstance')) {
        const value = await ev(e.args[0].value, env);
        const typeExpr = e.args[1].value;
        const typeValue = typeExpr.kind === 'variable' && TYPE_WORDS.concat(['list', 'tuple', 'set', 'dict', 'module', 'object']).includes(typeExpr.name)
          ? { __typeMarker: typeExpr.name }
          : await ev(typeExpr, env);
        return builtin('isinstance', [{ name: null, value }, { name: null, value: typeValue }], callee.token);
      }
      const vals = [];
      for (const a of e.args) vals.push({ name: a.name, value: await ev(a.value, env) });
      const name = callee.name;
      if (BUILTINS.has(name) && !env.find(name)) return builtin(name, vals, callee.token);
      return callValue(env.get(name, callee.token), vals, env, name, callee.token);
    }

    const target = await evx(callee, env);
    if (target === SHORT) return SHORT;
    const vals = [];
    for (const a of e.args) vals.push({ name: a.name, value: await ev(a.value, env) });
    return callValue(target, vals, env, 'this value', callee.token);
  }

  async function callValue(target, vals, env, name, tok = { line: 1, column: 1 }) {
    if (target && target.kind === 'class') return construct(target, vals, env);
    if (target && target.kind === 'function') return invoke(target, vals, env);
    if (typeof target === 'function') return await target(...vals.map(v => v.value));
    throw new CITError(`'${name}' is not callable.`, tok.line, tok.column);
  }

  async function invokeMethod(obj, typeName, plural, table, e, env) {
    const name = e.callee.name, tok = e.callee.token || { line: 1, column: 1 };
    const def = hasOwn(table, name) ? table[name] : null;
    if (!def) throw new CITError(`${plural} have no method '${name}'.`, tok.line, tok.column);
    const err = msg => new CITError(msg, tok.line, tok.column);
    const vals = [];
    for (const a of e.args) vals.push(await ev(a.value, env));
    if (vals.length < def.min || vals.length > def.max) {
      const want = def.max === Infinity ? `${def.min} or more` : def.min === def.max ? `${def.min}` : `${def.min} to ${def.max}`;
      throw err(`${typeName}.${name}() takes ${want} value${def.max === 1 ? '' : 's'} but got ${vals.length}.`);
    }
    if (def.mutates) requireMutable(e.callee.object, env, `change ${typeName}`, tok);
    const ctx = {
      err, tok,
      random: rand,
      call: (fn, ...args) => callValue(fn, args.map(value => ({ name: null, value })), env, 'callback', tok)
    };
    return await def.run(obj, vals, ctx);
  }

  // Reads a number from a number, a bool or a plain decimal text like "42" or " 3.7 ". Anything else gives null.
  function numberFrom(x) {
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(x.trim())) return Number(x.trim());
    return null;
  }

  async function builtin(name, vals, tok = { line: 1, column: 1 }) {
    const err = msg => new CITError(msg, tok.line, tok.column);
    const named = vals.filter(v => v.name);
    const args = vals.filter(v => !v.name).map(v => v.value);
    const isCast = ['castInt', 'castFloat', 'castString', 'castBool'].includes(name);
    for (const n of named) {
      if (!isCast && name !== 'dict' && name !== 'frozendict' && !(name === 'open' && n.name === 'encoding')) throw err(`${name}() does not take named arguments ('${n.name}').`);
      if (isCast && n.name !== 'fallback') throw err(`${name}() has no argument named '${n.name}'. It accepts: fallback.`);
    }
    const hasFallback = named.some(n => n.name === 'fallback');
    const fallback = hasFallback ? named.find(n => n.name === 'fallback').value : null;
    if (isCast && args.length !== 1) throw err(`${name}() takes 1 value (and an optional fallback) but got ${args.length}.`);

    switch (name) {
      case 'input': return String(await input(args.length ? format(args[0]) : ''));
      case 'castInt': case 'castFloat': {
        const n = numberFrom(args[0]);
        if (n === null) {
          if (hasFallback) return fallback;
          throw err(`${name}(): cannot convert ${format(args[0], true)} (${typeOf(args[0])}) to ${name === 'castInt' ? 'an int' : 'a float'}. Use fallback = value to avoid this error.`);
        }
        return name === 'castInt' ? Math.trunc(n) : n;
      }
      case 'castString': return format(args[0]);
      case 'castBool': {
        const x = args[0];
        if (typeof x === 'boolean') return x;
        if (typeof x === 'string') {
          const z = x.trim().toLowerCase();
          if (['false', '0', 'no', 'off', ''].includes(z)) return false;
          if (['true', '1', 'yes', 'on'].includes(z)) return true;
          if (hasFallback) return fallback;
        }
        return truthy(x);
      }
      case 'random': {
        if (args.length > 2 || !args.every(x => typeof x === 'number')) throw err('random() takes up to 2 numbers: random(), random(max) or random(min, max).');
        const [lo, hi] = args.length === 0 ? [0, 1] : args.length === 1 ? [0, args[0]] : args;
        if (lo > hi) throw err('random(): the first number must not be larger than the second.');
        return lo + rand() * (hi - lo);
      }
      case 'randint': {
        if (args.length < 1 || args.length > 2 || !args.every(Number.isInteger)) throw err('randint() takes 1 or 2 integers: randint(max) or randint(min, max).');
        const [lo, hi] = args.length === 1 ? [0, args[0]] : args;
        if (lo > hi) throw err('randint(): the first number must not be larger than the second.');
        return lo + Math.floor(rand() * (hi - lo + 1));
      }
      case 'range': {
        if (args.length < 1 || args.length > 3) throw err('range() takes 1 to 3 values: range(stop), range(start, stop) or range(start, stop, step).');
        if (!args.every(Number.isInteger)) throw err('range() values must be integers.');
        const [start, stop, step] = args.length === 1 ? [0, args[0], 1] : args.length === 2 ? [args[0], args[1], 1] : args;
        if (step === 0) throw err('range() step cannot be 0.');
        const out = [];
        for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
          out.push(i);
          if (out.length > 1000000) throw err('range() is too large (the limit is 1,000,000 values).');
        }
        return out;
      }
      case 'min': case 'max': {
        const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        if (!items.length) throw err(`${name}() needs at least one value.`);
        const allNum = items.every(x => typeof x === 'number'), allStr = items.every(x => typeof x === 'string');
        if (!allNum && !allStr) throw err(`${name}() needs values that are all numbers or all strings.`);
        return items.reduce((best, x) => (name === 'min' ? x < best : x > best) ? x : best);
      }
      case 'sum': {
        const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        if (!items.every(x => typeof x === 'number')) throw err('sum() needs numbers.');
        return items.reduce((a, b) => a + b, 0);
      }
      case 'len': {
        const x = args[0];
        if (args.length !== 1 || !(Array.isArray(x) || typeof x === 'string' || x instanceof Map)) throw err('len() takes one list, string or dictionary.');
        return Array.isArray(x) ? x.length : x instanceof Map ? x.size : [...x].length;
      }
      case 'list': return args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'string') ? [...args[0]] : args;
      case 'tuple': {
        const values = args.length === 1 && Array.isArray(args[0]) ? [...args[0]] : args;
        Object.defineProperty(values, TUPLE, { value: true });
        return Object.freeze(values);
      }
      case 'set': case 'frozenset': {
        const items = args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'string') ? [...args[0]] : args;
        const result = new Set(items);
        if (name === 'frozenset') READONLY.add(result);
        return result;
      }
      case 'dict': case 'frozendict': {
        const result = new Map();
        for (const arg of args) {
          if (!Array.isArray(arg) || arg.length !== 2) throw err(`${name}() positional values must be key/value pairs.`);
          result.set(dictKey(arg[0], tok), arg[1]);
        }
        for (const n of named) result.set(n.name, n.value);
        if (name === 'frozendict') READONLY.add(result);
        return result;
      }
      case 'union': case 'intersection': case 'difference': case 'symmetricDifference': {
        if (args.length !== 2 || !(args[0] instanceof Set) || !(args[1] instanceof Set)) throw err(`${name}() needs two sets.`);
        const [left, right] = args;
        if (name === 'union') return new Set([...left, ...right]);
        if (name === 'intersection') return new Set([...left].filter(value => right.has(value)));
        if (name === 'difference') return new Set([...left].filter(value => !right.has(value)));
        return new Set([...left].filter(value => !right.has(value)).concat([...right].filter(value => !left.has(value))));
      }
      case 'longString': {
        if (args.length !== 1) throw err('longString() takes one value.');
        return format(args[0]);
      }
      case 'longNumber': {
        if (args.length !== 1 || !(typeof args[0] === 'number' || typeof args[0] === 'string')) throw err('longNumber() takes one number or numeric string.');
        const value = typeof args[0] === 'number' ? args[0] : Number(args[0].trim());
        if (!Number.isFinite(value)) throw err('longNumber(): value must be a finite number.');
        return value;
      }
      case 'hex': case 'clr': {
        if (args.length !== 1 || typeof args[0] !== 'string') throw err(`${name}() needs one hexadecimal color string.`);
        const value = args[0].replace(/^#/, '');
        if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) throw err(`${name}() needs 3, 6 or 8 hexadecimal digits.`);
        return `#${value}`;
      }
      case 'rgb': case 'rgba': {
        const expected = name === 'rgb' ? 3 : 4;
        if (args.length !== expected || !args.every(value => typeof value === 'number' && Number.isFinite(value))) throw err(`${name}() needs ${expected} numeric values.`);
        const channels = args.slice(0, 3);
        if (channels.some(value => value < 0 || value > 255) || (name === 'rgba' && (args[3] < 0 || args[3] > 1))) throw err(`${name}() values are outside the ${name} range.`);
        return `${name}(${args.join(', ')})`;
      }
      case 'hsl': case 'hsv': {
        if (args.length !== 3 || !args.every(value => typeof value === 'number' && Number.isFinite(value))) throw err(`${name}() needs three numeric values.`);
        return `${name}(${args.join(', ')})`;
      }
      case 'object': return {};
      case 'type': {
        if (args.length !== 1) throw err('type() takes one value.');
        return typeOf(args[0]);
      }
      case 'bin': {
        if (args.length !== 1 || !Number.isInteger(args[0])) throw err('bin() needs one integer.');
        return (args[0] < 0 ? '-0b' : '0b') + Math.abs(args[0]).toString(2);
      }
      case 'zip': {
        if (!args.length || args.some(x => !(Array.isArray(x) || typeof x === 'string'))) throw err('zip() needs one or more lists or strings.');
        const rows = [], length = Math.min(...args.map(x => x.length));
        for (let i = 0; i < length; i++) rows.push(args.map(x => x[i]));
        return rows;
      }
      case 'enumerate': case 'enumarate': {
        if (args.length < 1 || args.length > 2 || !(Array.isArray(args[0]) || typeof args[0] === 'string')) throw err(`${name}() needs a list or string and an optional start index.`);
        const start = args[1] === undefined ? 0 : args[1];
        if (!Number.isInteger(start)) throw err(`${name}() start index must be an integer.`);
        return [...args[0]].map((item, index) => [start + index, item]);
      }
      case 'round': {
        if (args.length < 1 || args.length > 2 || typeof args[0] !== 'number') throw err('round() needs a number and an optional number of decimal places.');
        const digits = args[1] === undefined ? 0 : args[1];
        if (!Number.isInteger(digits) || digits < -100 || digits > 100) throw err('round() decimal places must be an integer between -100 and 100.');
        const factor = 10 ** digits;
        return Math.round((args[0] + Number.EPSILON) * factor) / factor;
      }
      case 'id': {
        if (args.length !== 1) throw err('id() takes one value.');
        const value = args[0];
        if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
          if (!objectIds.has(value)) objectIds.set(value, nextObjectId++);
          return objectIds.get(value);
        }
        const key = `${typeof value}:${String(value)}`;
        if (!primitiveIds.has(key)) primitiveIds.set(key, nextObjectId++);
        return primitiveIds.get(key);
      }
      case 'isinstance': {
        if (args.length !== 2) throw err('isinstance() takes a value and a type name.');
        const target = args[1];
        if (target && target.kind === 'class') return Boolean(args[0]?.__classChain?.includes(target.name) || args[0]?.__class === target.name);
        if (target && target.__typeMarker) return typeOf(args[0]) === target.__typeMarker;
        if (typeof target === 'string') return typeOf(args[0]) === target || (args[0] && args[0].__class === target);
        throw err('isinstance() type must be a type name or a class.');
      }
      case 'issubclass': {
        if (args.length !== 2 || !(args[0]?.kind === 'class') || !(args[1]?.kind === 'class')) throw err('issubclass() needs two classes.');
        for (let cls = args[0]; cls; cls = cls.parent) if (cls === args[1]) return true;
        return false;
      }
      case 'square': {
        if (args.length !== 1 || typeof args[0] !== 'number') throw err('square() needs one number.');
        return args[0] ** 2;
      }
      case 'printf': {
        if (!args.length || typeof args[0] !== 'string') throw err('printf() needs a format string.');
        let index = 1;
        const text = args[0].replace(/%%|%[sdif]/g, spec => {
          if (spec === '%%') return '%';
          if (index >= args.length) throw err('printf() has more format specifiers than values.');
          const value = args[index++];
          return spec === '%d' || spec === '%i' ? String(Math.trunc(Number(value))) : spec === '%f' ? String(Number(value)) : format(value);
        });
        if (index !== args.length) throw err('printf() has more values than format specifiers.');
        emit('print', text);
        return null;
      }
      case 'sleep': {
        if (args.length !== 1 || typeof args[0] !== 'number' || args[0] < 0) throw err('sleep() needs one non-negative number of seconds.');
        await new Promise(resolve => setTimeout(resolve, args[0] * 1000));
        return null;
      }
      case 'open': {
        if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string') throw err('open() needs a file name and an optional mode.');
        const mode = args[1] === undefined ? 'read' : args[1];
        const encoding = named.find(item => item.name === 'encoding')?.value || 'utf-8';
        if (!['read', 'write', 'append'].includes(mode)) throw err("open() mode must be 'read', 'write' or 'append'.");
        if (!['utf-8', 'utf8'].includes(encoding)) throw err('open() currently supports UTF-8 text files only.');
        const filePath = path.resolve(currentDir || process.cwd(), args[0]);
        try {
          if (mode === 'write') fs.writeFileSync(filePath, '', { encoding: 'utf8' });
          if (mode === 'append' && !fs.existsSync(filePath)) fs.writeFileSync(filePath, '', { encoding: 'utf8' });
        } catch (cause) { throw err(`Cannot open '${args[0]}': ${cause.message}`); }
        return {
          write(text) {
            if (mode === 'read') throw new CITError('Cannot write to a file opened for reading.');
            try { fs.appendFileSync(filePath, format(text), 'utf8'); }
            catch (cause) { throw new CITError(`Cannot write '${args[0]}': ${cause.message}`); }
            return null;
          },
          read() {
            if (mode !== 'read') throw new CITError('Cannot read from a file opened for writing.');
            try { return fs.readFileSync(filePath, 'utf8'); }
            catch (cause) { throw new CITError(`Cannot read '${args[0]}': ${cause.message}`); }
          },
          close() { return null; }
        };
      }
    }
    throw err(`Unknown built-in '${name}'.`);
  }

  async function invoke(fn, args, parent) {
    const local = new Env(fn.closure || parent);
    local.defers = [];
    local.functionId = fn.staticId || fn.name || 'anonymous';
    local.accessorName = fn.accessor ? fn.name : null;
    const positional = args.filter(argument => !argument.name);
    const named = new Map();
    for (const argument of args) {
      if (!argument.name) continue;
      if (named.has(argument.name)) throw new CITError(`Argument '${argument.name}' was supplied more than once.`);
      named.set(argument.name, argument.value);
    }
    let pos = 0;
    const usedNames = new Set();
    for (const p of fn.params) {
      let v;
      if (p.kind === 'args') {
        v = positional.slice(pos).map(argument => argument.value);
        pos = positional.length;
      } else if (p.kind === 'kwargs') {
        v = new Map([...named].filter(([key]) => !usedNames.has(key)));
        for (const key of v.keys()) usedNames.add(key);
      } else if (named.has(p.name)) {
        if (pos < positional.length) throw new CITError(`Argument '${p.name}' was supplied by both position and name.`);
        v = named.get(p.name);
        usedNames.add(p.name);
      } else if (pos < positional.length) v = positional[pos++].value;
      else if (p.default !== null) v = await ev(p.default, local);
      else throw new CITError(`Missing argument '${p.name}'.`);
      local.define(p.name, v, false).param = true;   // parameters can't be reassigned, but a list passed in can be changed
    }
    if (pos < positional.length) throw new CITError(`Too many positional arguments: expected ${fn.params.filter(parameter => parameter.kind === 'normal').length}, received ${positional.length}.`);
    const unknown = [...named.keys()].find(key => !usedNames.has(key) && !fn.params.some(parameter => parameter.name === key));
    if (unknown) throw new CITError(`Unexpected named argument '${unknown}'.`);
    return withDefers(local, async () => {
      const r = await exec(fn.body, local);
      return r && r.type === RETURN ? r.value : null;
    });
  }

  // Runs `body`, then the deferred statements of `frame` (last deferred runs first), even if body failed.
  async function withDefers(frame, body) {
    let result = null, error = null, failed = false;
    try { result = await body(); } catch (e) { error = e; failed = true; }
    if (!(failed && error && error.fatal)) {
      for (let i = frame.defers.length - 1; i >= 0; i--) {
        const d = frame.defers[i];
        try { await exec([d.stmt], d.env); } catch (e) { if (!failed) { error = e; failed = true; } }
      }
    }
    if (failed) throw error;
    return result;
  }

  // Creates an instance. For `class child(parent())` the parent's methods come first and the child's
  // methods override them; super() inside a method gives access to the parent's version.
  async function construct(cls, args, env) {
    const chain = [];
    for (let c = cls; c; c = c.parent) chain.unshift(c);          // root class first
    const instance = { __class: cls.name, __classChain: chain.map(c => c.name) };
    const instanceEnv = new Env(env);
    instanceEnv.instance = instance;
    instanceEnv.define('self', instance, false);

    const tables = [], operatorTables = [];
    const getterFns = {}, setterFns = {};
    let structFn = null, structEnv = null;
    for (const [i, c] of chain.entries()) {
      const levelEnv = new Env(instanceEnv);
      levelEnv.className = c.name;
      levelEnv.define('super', async () => {
        if (i === 0) throw new CITError(`'${c.name}' has no parent class, so super() cannot be used.`);
        return parentView(i - 1);
      }, false);
      const table = {};
      for (const [n, m] of Object.entries(c.methods)) {
        table[n] = async (...raw) => invoke(m, raw.map(value => ({ name: null, value })), levelEnv);
        if (n === 'struct') { structFn = m; structEnv = levelEnv; }
      }
      tables.push(table);
      operatorTables.push(Object.fromEntries(Object.entries(c.operators || {}).map(([operator, handler]) => [
        operator, async value => invoke(handler, [{ name: null, value }], levelEnv)
      ])));
      for (const [name, getter] of Object.entries(c.getters)) getterFns[name] = async () => invoke(getter, [], levelEnv);
      for (const [name, setter] of Object.entries(c.setters)) setterFns[name] = async value => invoke(setter, [{ name: null, value }], levelEnv);
      for (const [name, field] of Object.entries(c.fields)) {
        const value = await ev(field.expr, levelEnv);
        instance[name] = value;
        const binding = instanceEnv.values.get(name);
        if (binding) { binding.value = value; binding.mutable = field.mutable; }
        else instanceEnv.define(name, value, field.mutable, typeOf(value), field.token);
        if (field.visibility) {
          let access = FIELD_ACCESS.get(instance);
          if (!access) { access = new Map(); FIELD_ACCESS.set(instance, access); }
          access.set(name, { visibility: field.visibility, owner: c.name });
        }
      }
    }
    const merged = upto => Object.assign({}, ...tables.slice(0, upto + 1));
    const mergedOperators = Object.assign({}, ...operatorTables);
    const parentView = i => Object.assign(merged(i), { __class: chain[i].name });

    Object.assign(instance, merged(chain.length - 1));
    Object.defineProperty(instance, '__operators', { value: mergedOperators });
    Object.defineProperty(instance, '__getters', { value: getterFns });
    Object.defineProperty(instance, '__setters', { value: setterFns });
    if (structFn) await invoke(structFn, args, structEnv);
    return instance;
  }

  /* ---- modules (import) ---- */

  function defaultAlias(spec) {
    let a = String(spec).split(/[\\/]/).filter(Boolean).pop() || 'module';
    a = a.replace(/\.(cit|ct)$/, '').replace(/[^A-Za-z0-9_]/g, '_');
    return /^[0-9]/.test(a) ? '_' + a : a;
  }

  async function loadModule(spec, tok) {
    if (spec === 'math') {
      const mathFunction = (name, minArgs, maxArgs, fn, integerArgs = []) => (...args) => {
        if (args.length < minArgs || args.length > maxArgs) {
          throw new CITError(`math.${name}() takes ${minArgs === maxArgs ? minArgs : `${minArgs} to ${maxArgs}`} value${maxArgs === 1 ? '' : 's'} but got ${args.length}.`, tok.line, tok.column);
        }
        if (args.some((value, index) => typeof value !== 'number' || (integerArgs.includes(index) && !Number.isInteger(value)))) {
          const requirement = integerArgs.length ? 'numbers (integers where required)' : 'numbers';
          throw new CITError(`math.${name}() needs ${requirement}.`, tok.line, tok.column);
        }
        return fn(...args);
      };
      const listFunction = (name, fn) => (...args) => {
        if (args.length !== 1) throw new CITError(`math.${name}() takes 1 list but got ${args.length} arguments.`, tok.line, tok.column);
        const [values] = args;
        if (!Array.isArray(values) || !values.length || !values.every(value => typeof value === 'number')) {
          throw new CITError(`math.${name}() needs a non-empty list of numbers.`, tok.line, tok.column);
        }
        return fn(values);
      };
      return {
        __module: 'math',
        ceil: mathFunction('ceil', 1, 1, Math.ceil), floor: mathFunction('floor', 1, 1, Math.floor),
        trunc: mathFunction('trunc', 1, 1, Math.trunc), sqrt: mathFunction('sqrt', 1, 1, Math.sqrt),
        cbrt: mathFunction('cbrt', 1, 1, Math.cbrt), exp: mathFunction('exp', 1, 1, Math.exp),
        log: mathFunction('log', 1, 2, (value, base = Math.E) => Math.log(value) / Math.log(base)),
        log2: mathFunction('log2', 1, 1, Math.log2),
        sin: mathFunction('sin', 1, 1, Math.sin), cos: mathFunction('cos', 1, 1, Math.cos),
        tan: mathFunction('tan', 1, 1, Math.tan),
        degrees: mathFunction('degrees', 1, 1, value => value * 180 / Math.PI),
        radians: mathFunction('radians', 1, 1, value => value * Math.PI / 180),
        factorial: mathFunction('factorial', 1, 1, value => {
          if (!Number.isInteger(value) || value < 0 || value > 170) throw new CITError('math.factorial() needs an integer from 0 to 170.');
          let result = 1; for (let i = 2; i <= value; i++) result *= i; return result;
        }, [0]),
        gcd: mathFunction('gcd', 2, 2, (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }, [0, 1]),
        lcm: mathFunction('lcm', 2, 2, (a, b) => a && b ? Math.abs(a * b) / mathGcd(a, b) : 0, [0, 1]),
        mean: listFunction('mean', values => {
          return values.reduce((total, value) => total + value, 0) / values.length;
        }),
        median: listFunction('median', values => {
          const sorted = [...values].sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        }),
        mode: listFunction('mode', values => {
          const counts = new Map();
          for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
          let selected = values[0], count = 0;
          for (const [value, occurrences] of counts) if (occurrences > count) { selected = value; count = occurrences; }
          return selected;
        }),
        stddev: listFunction('stddev', values => {
          const average = values.reduce((total, value) => total + value, 0) / values.length;
          return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length);
        }),
        dist: (...args) => {
          if (args.length !== 2) throw new CITError(`math.dist() takes 2 lists but got ${args.length} arguments.`, tok.line, tok.column);
          const [left, right] = args;
          if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.every(value => typeof value === 'number') || !right.every(value => typeof value === 'number')) {
            throw new CITError('math.dist() needs equal-length lists of numbers.', tok.line, tok.column);
          }
          let distance = 0;
          for (let index = 0; index < left.length; index++) distance = Math.hypot(distance, left[index] - right[index]);
          return distance;
        },
        e: Math.E, pi: Math.PI, tau: Math.PI * 2, nan: NaN, inf: Infinity
      };
    }
    if (spec === 'json') return {
      __module: 'json',
      dumps: value => JSON.stringify(toJsonValue(value)),
      stringify: value => JSON.stringify(toJsonValue(value)),
      dump: (value, file) => {
        if (!file || typeof file.write !== 'function') throw new CITError('json.dump(value, file) needs a writable file.');
        file.write(JSON.stringify(toJsonValue(value)));
        return null;
      },
      loads: text => {
        if (typeof text !== 'string') throw new CITError('json.loads() needs a string.');
        try {         return fromJsonValue(JSON.parse(text)); } catch (cause) { throw new CITError(`json.loads(): ${cause.message}`, tok.line, tok.column); }
      },
      load: file => {
        if (!file || typeof file.read !== 'function') throw new CITError('json.load(file) needs a readable file.');
        try { return fromJsonValue(JSON.parse(file.read())); } catch (cause) { throw new CITError(`json.load(): ${cause.message}`, tok.line, tok.column); }
      },
      parse: text => {
        if (typeof text !== 'string') throw new CITError('json.parse() needs a string.');
        try { return fromJsonValue(JSON.parse(text)); } catch (cause) { throw new CITError(`json.parse(): ${cause.message}`, tok.line, tok.column); }
      },
      read: filename => {
        if (typeof filename !== 'string') throw new CITError('json.read() needs a file name.');
        try { return fromJsonValue(JSON.parse(fs.readFileSync(path.resolve(currentDir || process.cwd(), filename), 'utf8'))); }
        catch (cause) { throw new CITError(`json.read(): ${cause.message}`, tok.line, tok.column); }
      },
      write: (filename, value) => {
        if (typeof filename !== 'string') throw new CITError('json.write() needs a file name.');
        try { fs.writeFileSync(path.resolve(currentDir || process.cwd(), filename), JSON.stringify(toJsonValue(value), null, 2), 'utf8'); }
        catch (cause) { throw new CITError(`json.write(): ${cause.message}`, tok.line, tok.column); }
        return null;
      },
      minify: text => {
        if (typeof text !== 'string') throw new CITError('json.minify() needs JSON text.');
        try { return JSON.stringify(JSON.parse(text)); } catch (cause) { throw new CITError(`json.minify(): ${cause.message}`, tok.line, tok.column); }
      },
      validate: text => {
        if (typeof text !== 'string') throw new CITError('json.validate() needs JSON text.');
        try { JSON.parse(text); return true; } catch { return false; }
      },
      colorize: text => {
        if (typeof text !== 'string') throw new CITError('json.colorize() needs JSON text.');
        try {
          const pretty = JSON.stringify(JSON.parse(text), null, 2);
          if (process.env.NO_COLOR) return pretty;
          return pretty.replace(/("(?:\\.|[^"\\])*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g, (token, string, colon) => {
            const color = string ? (colon ? 36 : 32)
              : token === 'null' ? 90 : token === 'true' || token === 'false' ? 35 : 33;
            return `\x1b[${color}m${string || token}\x1b[0m${colon || ''}`;
          });
        } catch (cause) { throw new CITError(`json.colorize(): ${cause.message}`, tok.line, tok.column); }
      },
      merge: (left, right) => {
        if (!(left instanceof Map) || !(right instanceof Map)) throw new CITError('json.merge() needs two objects parsed from JSON.');
        return new Map([...left, ...right]);
      },
      query: (value, selector) => {
        if (typeof selector !== 'string' || !selector.startsWith('$')) throw new CITError('json.query() path must start with $.');
        const parts = selector.slice(1).match(/(?:\.([A-Za-z_][A-Za-z0-9_]*))|(?:\[(\d+)\])/g) || [];
        if (parts.join('') !== selector.slice(1)) throw new CITError('json.query() supports only $.name and [index] path segments.');
        let current = value;
        for (const part of parts) {
          if (part[0] === '.') current = current instanceof Map ? current.get(part.slice(1)) : current?.[part.slice(1)];
          else current = Array.isArray(current) ? current[Number(part.slice(1, -1))] : undefined;
        }
        return current === undefined ? null : current;
      }
    };
    if (spec === 'time') {
      const checkArgs = (name, args, min, max) => {
        if (args.length < min || args.length > max) throw new CITError(`time.${name}() takes ${min === max ? min : `${min} to ${max}`} value${max === 1 ? '' : 's'} but got ${args.length}.`, tok.line, tok.column);
      };
      const timeObject = (date, utc) => {
        const get = method => date[`${utc ? 'getUTC' : 'get'}${method}`]();
        const jan1 = new Date(Date.UTC(get('FullYear'), 0, 1));
        const epoch = Date.UTC(get('FullYear'), get('Month'), get('Date'));
        return { year: get('FullYear'), month: get('Month') + 1, day: get('Date'), hour: get('Hours'), minute: get('Minutes'), second: get('Seconds'),
          weekday: get('Day'), yearday: Math.floor((epoch - jan1.getTime()) / 86400000) + 1, isdst: false };
      };
      const formatTime = (format, date, utc = false) => {
        const data = timeObject(date, utc);
        const pad = (value, size = 2) => String(value).padStart(size, '0');
        const names = { a: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], A: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], b: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], B: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
        const codes = { Y: String(data.year), y: pad(data.year % 100), m: pad(data.month), d: pad(data.day), H: pad(data.hour), M: pad(data.minute), S: pad(data.second), w: String(data.weekday), j: pad(data.yearday, 3), a: names.a[data.weekday], A: names.A[data.weekday], b: names.b[data.month - 1], B: names.B[data.month - 1], '%': '%' };
        return format.replace(/%([YymdHMSwjaAbB%])/g, (_, code) => codes[code]);
      };
      return {
        __module: 'time',
        time: () => Date.now() / 1000,
        ctime: value => new Date(value === undefined ? Date.now() : value * 1000).toString(),
        perfCounter: () => Number(process.hrtime.bigint()) / 1e9,
        localtime: value => timeObject(new Date(value === undefined ? Date.now() : value * 1000), false),
        gmtime: value => timeObject(new Date(value === undefined ? Date.now() : value * 1000), true),
        asctime: value => {
          const date = value ? timeFromStruct(value) : new Date();
          return formatTime('%a %b %d %H:%M:%S %Y', date);
        },
        strftime: (format, value) => formatTime(format, value === undefined ? new Date() : timeFromStruct(value)),
        strptime: (text, format) => parseTime(text, format, tok)
      };
    }
    if (spec === 'cli') {
      const requireList = (value, name) => {
        if (!Array.isArray(value)) throw new CITError(`cli.${name}() needs a list.`, tok.line, tok.column);
        return value;
      };
      return {
        __module: 'cli',
        select: async (items, prompt = 'Select an option:') => {
          items = requireList(items, 'select');
          items.forEach((item, index) => output(`${index + 1}) ${format(item)}`, 'out'));
          const answer = Number(await input(`${prompt} `));
          if (!Number.isInteger(answer) || answer < 1 || answer > items.length) throw new CITError('cli.select(): enter one of the displayed option numbers.', tok.line, tok.column);
          return answer - 1;
        },
        table: rows => {
          rows = requireList(rows, 'table');
          if (!rows.every(Array.isArray)) throw new CITError('cli.table() needs a list of rows.', tok.line, tok.column);
          const widths = [];
          for (const row of rows) row.forEach((cell, index) => { widths[index] = Math.max(widths[index] || 0, format(cell).length); });
          for (const row of rows) output(`| ${widths.map((width, index) => format(row[index] ?? '').padEnd(width)).join(' | ')} |`, 'out');
          return null;
        },
        clear: () => { output('\x1b[2J\x1b[3J\x1b[H', 'print'); return null; },
        cursor: (x, y) => {
          if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1) throw new CITError('cli.cursor() needs positive integer x and y coordinates.', tok.line, tok.column);
          output(`\x1b[${y};${x}H`, 'print'); return null;
        },
        progress: value => {
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new CITError('cli.progress() needs a number from 0 to 100.', tok.line, tok.column);
          const percentage = Math.max(0, Math.min(100, Math.round(value)));
          output(`[${'#'.repeat(Math.floor(percentage / 5)).padEnd(20, '-')} ] ${percentage}%`, 'out');
          return percentage;
        },
        confirm: async (prompt = 'Continue?') => /^(y|yes)$/i.test(String(await input(`${prompt} [y/N] `)).trim()),
        password: async (prompt = 'Password:') => {
          if (!options.supportsHiddenInput) throw new CITError('cli.password() requires a terminal that supports hidden input.', tok.line, tok.column);
          return String(await input(`${prompt} `, { hidden: true }));
        },
        size: () => new Map([['columns', process.stdout.columns || 80], ['rows', process.stdout.rows || 24]]),
        spinner: message => { output(`${format(message)}...`, 'out'); return null; },
        checkbox: async items => {
          items = requireList(items, 'checkbox');
          items.forEach((item, index) => output(`${index + 1}) ${format(item)}`, 'out'));
          const answer = String(await input('Select option numbers separated by commas:')).trim();
          if (!answer) return [];
          const indices = answer.split(',').map(value => Number(value.trim()) - 1);
          if (!indices.every(index => Number.isInteger(index) && index >= 0 && index < items.length)) throw new CITError('cli.checkbox(): enter valid displayed option numbers.', tok.line, tok.column);
          return [...new Set(indices)];
        }
      };
    }
    if (spec === 'sys') {
      const os = require('node:os');
      return {
        __module: 'sys',
        env: name => name === undefined ? { ...process.env } : process.env[String(name)] ?? null,
        args: () => process.argv.slice(2),
        exit: code => {
          if (code === undefined) code = 0;
          if (!Number.isInteger(code) || code < 0 || code > 255) throw new CITError('sys.exit() needs an exit code from 0 to 255.', tok.line, tok.column);
          throw new CITExit(code);
        },
        platform: () => process.platform,
        cwd: () => process.cwd(),
        arch: () => process.arch,
        pid: process.pid,
        stdout: text => { process.stdout.write(String(text)); return null; },
        stderr: text => { process.stderr.write(String(text)); return null; },
        memory: () => process.memoryUsage(),
        user: () => os.userInfo(),
        beep: () => { output('\x07', 'print'); return null; },
        uptime: () => process.uptime(),
        clipRead: async () => {
          if (typeof options.clipboard?.readText !== 'function') throw new CITError('sys.clipRead() is available only in the VS Code extension host.');
          return options.clipboard.readText();
        },
        clipWrite: async text => {
          if (typeof text !== 'string') throw new CITError('sys.clipWrite() needs a string.');
          if (typeof options.clipboard?.writeText !== 'function') throw new CITError('sys.clipWrite() is available only in the VS Code extension host.');
          await options.clipboard.writeText(text);
          return null;
        },
        cpuInfo: () => os.cpus().map(({ model, speed }) => ({ model, speed })),
        cpuLoad: () => os.loadavg(),
        networkInterfaces: () => os.networkInterfaces(),
        which: name => {
          if (typeof name !== 'string' || !name || /[\\/]/.test(name)) throw new CITError('sys.which() needs a command name without a path.', tok.line, tok.column);
          const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
          for (const directory of (process.env.PATH || '').split(path.delimiter)) {
            for (const extension of extensions) {
              const candidate = path.join(directory, name + extension);
              try {
                if (!fs.statSync(candidate).isFile()) continue;
                if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
              } catch {}
            }
          }
          return null;
        },
        isAdmin: () => typeof process.getuid === 'function' ? process.getuid() === 0 : null
      };
    }
    if (spec === 'datetime') {
      const duration = unit => ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]);
      const cronValues = (field, min, max) => {
        const allowed = new Set();
        for (const part of field.split(',')) {
          const [rangeText, stepText] = part.split('/');
          const step = stepText === undefined ? 1 : Number(stepText);
          if (!Number.isInteger(step) || step < 1) return null;
          let start, end;
          if (rangeText === '*') [start, end] = [min, max];
          else if (/^\d+$/.test(rangeText)) {
            start = Number(rangeText);
            end = stepText === undefined ? start : max;
          } else if (/^\d+-\d+$/.test(rangeText)) [start, end] = rangeText.split('-').map(Number);
          else return null;
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) return null;
          for (let item = start; item <= end; item += step) allowed.add(item);
        }
        return allowed;
      };
      const toDate = value => {
        let date;
        if (value === undefined) date = new Date();
        else if (typeof value === 'number') date = new Date(value < 1e12 ? value * 1000 : value);
        else if (value instanceof Date) date = new Date(value.getTime());
        else if (typeof value === 'string') date = new Date(value);
        else if (value && typeof value === 'object') date = timeFromStruct(value);
        else throw new CITError('datetime expected a timestamp, date string or date structure.', tok.line, tok.column);
        if (Number.isNaN(date.getTime())) throw new CITError('datetime received an invalid date or timestamp.', tok.line, tok.column);
        return date;
      };
      return {
        __module: 'datetime',
        now: () => {
          const date = new Date();
          return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(), millisecond: date.getMilliseconds() };
        },
        timestamp: value => toDate(value).getTime() / 1000,
        format: (value, pattern = '%Y-%m-%d %H:%M:%S') => {
          const date = toDate(value);
          return pattern.replace(/%([YymdHMSf%])/g, (_, code) => ({
            Y: String(date.getFullYear()), y: String(date.getFullYear() % 100).padStart(2, '0'),
            m: String(date.getMonth() + 1).padStart(2, '0'), d: String(date.getDate()).padStart(2, '0'),
            H: String(date.getHours()).padStart(2, '0'), M: String(date.getMinutes()).padStart(2, '0'),
            S: String(date.getSeconds()).padStart(2, '0'), f: String(date.getMilliseconds()).padStart(3, '0'), '%': '%'
          })[code]);
        },
        wait: milliseconds => {
          if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) throw new CITError('datetime.wait() needs non-negative milliseconds.', tok.line, tok.column);
          return new Promise(resolve => setTimeout(resolve, milliseconds));
        },
        ticker: async (milliseconds, count) => {
          if (!Number.isFinite(milliseconds) || milliseconds < 0 || !Number.isInteger(count) || count < 0 || count > 10000) throw new CITError('datetime.ticker() needs a non-negative interval and a count from 0 to 10000.', tok.line, tok.column);
          const ticks = [];
          for (let index = 0; index < count; index++) { await new Promise(resolve => setTimeout(resolve, milliseconds)); ticks.push(Date.now()); }
          return ticks;
        },
        add: (value, amount, unit = 'ms') => {
          const scale = duration(unit);
          if (!scale || typeof amount !== 'number' || !Number.isFinite(amount)) throw new CITError('datetime.add() needs an amount and a unit: ms, s, m, h or d.', tok.line, tok.column);
          return new Date(toDate(value).getTime() + amount * scale).toISOString();
        },
        subtract: (value, amount, unit = 'ms') => {
          const scale = duration(unit);
          if (!scale || typeof amount !== 'number' || !Number.isFinite(amount)) throw new CITError('datetime.subtract() needs an amount and a unit: ms, s, m, h or d.', tok.line, tok.column);
          return new Date(toDate(value).getTime() - amount * scale).toISOString();
        },
        diff: (left, right, unit = 'ms') => {
          const scale = duration(unit);
          if (!scale) throw new CITError('datetime.diff() unit must be ms, s, m, h or d.', tok.line, tok.column);
          return (toDate(right).getTime() - toDate(left).getTime()) / scale;
        },
        benchmark: async callback => {
          if (typeof callback !== 'function') throw new CITError('datetime.benchmark() needs a function.', tok.line, tok.column);
          const start = process.hrtime.bigint();
          const result = await callback();
          return { result, durationMs: Number(process.hrtime.bigint() - start) / 1e6 };
        },
        cron: (expression, after) => {
          if (typeof expression !== 'string') throw new CITError('datetime.cron() needs a five-field cron expression.', tok.line, tok.column);
          const fields = expression.trim().split(/\s+/);
          if (fields.length !== 5) throw new CITError('datetime.cron() expects minute hour day-of-month month day-of-week fields.', tok.line, tok.column);
          const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
          const valueSets = fields.map((field, index) => {
            const [min, max] = ranges[index];
            return cronValues(field, min, max);
          });
          if (valueSets.some((values, index) => !values?.size)) throw new CITError('datetime.cron(): one or more cron fields are invalid.', tok.line, tok.column);
          const start = toDate(after);
          start.setSeconds(0, 0);
          start.setMinutes(start.getMinutes() + 1);
          const wildcardDay = fields[2] === '*', wildcardWeekday = fields[4] === '*';
          for (let step = 0; step < 60 * 24 * 366 * 5; step++) {
            const date = new Date(start.getTime() + step * 60000);
            const weekday = date.getDay();
            const dayMatches = valueSets[2].has(date.getDate());
            const weekMatches = valueSets[4].has(weekday) || (weekday === 0 && valueSets[4].has(7));
            if (valueSets[0].has(date.getMinutes())
              && valueSets[1].has(date.getHours())
              && valueSets[3].has(date.getMonth() + 1)
              && (wildcardDay ? weekMatches : wildcardWeekday ? dayMatches : dayMatches || weekMatches)) return date.toISOString();
          }
          throw new CITError('datetime.cron(): no occurrence found within five years.', tok.line, tok.column);
        }
      };
    }
    if (spec === 'database') {
      let DatabaseSync;
      try { ({ DatabaseSync } = require('node:sqlite')); }
      catch {
        throw new CITError('SQLite support requires a Node.js runtime with node:sqlite (Node.js 22.5 or later).', tok.line, tok.column);
      }
      return {
        __module: 'database',
        connect: filename => {
          if (typeof filename !== 'string' || !filename) throw new CITError('database.connect() needs a database filename.', tok.line, tok.column);
          let connection;
          try { connection = new DatabaseSync(filename === ':memory:' ? filename : path.resolve(currentDir || process.cwd(), filename)); }
          catch (cause) { throw new CITError(`database.connect(): ${cause.message}`, tok.line, tok.column); }
          const parameters = values => {
            if (values === undefined) return [];
            if (!Array.isArray(values)) throw new CITError('SQLite parameters must be supplied as a list.');
            return values.map(value => value instanceof Map ? Object.fromEntries(value) : value);
          };
          return {
            run: (sql, values) => {
              if (typeof sql !== 'string') throw new CITError('SQLite SQL must be a string.');
              try {
                const result = connection.prepare(sql).run(...parameters(values));
                return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
              } catch (cause) { throw new CITError(`SQLite run failed: ${cause.message}`); }
            },
            all: (sql, values) => {
              if (typeof sql !== 'string') throw new CITError('SQLite SQL must be a string.');
              try { return connection.prepare(sql).all(...parameters(values)).map(row => Object.fromEntries(Object.entries(row))); }
              catch (cause) { throw new CITError(`SQLite query failed: ${cause.message}`); }
            },
            close: () => { connection.close(); return null; }
          };
        }
      };
    }
    if (typeof options.resolveModule !== 'function') throw new CITError('Imports are not available in this environment.', tok.line, tok.column);
    let r;
    try { r = options.resolveModule(spec, currentDir); } catch (err) { throw new CITError(err.message, tok.line, tok.column); }
    if (moduleCache.has(r.filename)) return moduleCache.get(r.filename);
    if (loading.has(r.filename)) throw new CITError(`Circular import of '${spec}'.`, tok.line, tok.column);
    loading.add(r.filename);
    const prevDir = currentDir;
    currentDir = r.dir;
    try {
      const menv = new Env(null);
      menv.defers = [];
      try { const mast = new Parser(tokenize(r.source)).parse(); await withDefers(menv, () => exec(mast, menv)); }
      catch (err) {
        if (err instanceof CITError && !err.inModule) {
          err.message = `In '${spec}' (line ${err.line}): ${err.message}`;
          err.line = tok.line; err.column = tok.column; err.inModule = true;
        }
        throw err;
      }
      const mod = {};
      Object.defineProperty(mod, '__module', { value: spec, enumerable: false });
      for (const [n, x] of menv.values) {
        const v = x.value;
        if (v && v.kind === 'function') mod[n] = async (...raw) => invoke(v, raw.map(value => ({ name: null, value })), menv);
        else if (v && v.kind === 'class') mod[n] = async (...raw) => construct(v, raw.map(value => ({ name: null, value })), menv);
        else mod[n] = v;
      }
      moduleCache.set(r.filename, mod);
      return mod;
    } finally { loading.delete(r.filename); currentDir = prevDir; }
  }

  /* ---- assignment ---- */

  // Works out what an assignment target refers to (evaluating its parts once) and returns get/set helpers.
  async function resolveTarget(t, env, visibility = null) {
    if (t.kind === 'variable') return { get: () => env.get(t.name, t.token), set: async v => await env.set(t.name, v, t.token) };
    if (t.kind === 'member') {
      if (t.optional) throw new CITError("A safe '?.' cannot be used on the left side of an assignment.", t.token.line, t.token.column);
      const o = await ev(t.object, env);
      if (o === null || typeof o !== 'object' || Array.isArray(o) || o instanceof Map) {
        throw new CITError(`Cannot set '${t.name}' on a ${typeOf(o)}.`, t.token.line, t.token.column);
      }
      const currentAccess = FIELD_ACCESS.get(o)?.get(t.name);
      if (currentAccess && !o.__setters?.[t.name] && !canAccessField(o, currentAccess, env)) {
        throw new CITError(`Cannot access ${currentAccess.visibility} field '${t.name}' outside its class.`, t.token.line, t.token.column);
      }
      const setter = o.__setters?.[t.name] && env.accessorName !== t.name ? o.__setters[t.name] : null;
      if (setter) return { get: async () => await readMember(o, { name: t.name, token: t.token }, env), set: async v => await setter(v) };
      return { get: () => (hasOwn(o, t.name) ? o[t.name] : null), set: v => {
        let frame = env;
        while (frame && frame.instance !== o) frame = frame.parent;
        let binding = frame && frame.values.get(t.name);
        if (frame && !binding) binding = frame.define(t.name, hasOwn(o, t.name) ? o[t.name] : v, true, typeOf(v), t.token);
        if (binding && !binding.mutable) throw new CITError(`Cannot reassign immutable field '${t.name}'.`, t.token.line, t.token.column);
        o[t.name] = v;
        if (binding) binding.value = v;
        if (visibility) {
          let fields = FIELD_ACCESS.get(o);
          if (!fields) { fields = new Map(); FIELD_ACCESS.set(o, fields); }
          const access = { visibility, owner: env.className || o.__class };
          fields.set(t.name, access);
          if (binding) binding.fieldAccess = access;
        }
      } };
    }
    const o = await ev(t.object, env);
    const key = await indexValue(t.index, env, o);
    if (Array.isArray(o)) {
      requireMutable(t.object, env, 'change list', t.token);
      return { get: () => readIndex(o, key, t.token), set: v => { readIndex(o, key, t.token); o[key < 0 ? key + o.length : key] = v; } };
    }
    if (o instanceof Map) {
      requireMutable(t.object, env, 'change dictionary', t.token);
      dictKey(key, t.token);
      return { get: () => readIndex(o, key, t.token), set: v => { o.set(key, v); } };
    }
    throw new CITError(`Only list and dictionary items can be assigned, not items of a ${typeOf(o)}.`, t.token.line, t.token.column);
  }

  async function assign(s, env) {
    if (s.target.kind === 'variable' && s.target.name.startsWith('$') && !env.find(s.target.name) && s.op === '=') {
      const value = await ev(s.expr, env);
      env.define(s.target.name, value, true, typeOf(value), s.target.token);
      return;
    }
    if (s.target.kind === 'pattern') {
      const value = await ev(s.expr, env);
      if (!Array.isArray(value)) throw new CITError('A destructuring assignment needs a list or tuple on the right side.', s.token.line, s.token.column);
      if (value.length !== s.target.items.length) throw new CITError(`Destructuring expected ${s.target.items.length} values but received ${value.length}.`, s.token.line, s.token.column);
      for (let i = 0; i < s.target.items.length; i++) {
        const target = s.target.items[i];
        if (target) {
          if (target.kind !== 'variable') throw new CITError('Destructuring targets must be variable names.', s.token.line, s.token.column);
          if (target.name !== '_') await env.set(target.name, value[i], target.token);
        }
      }
      return;
    }
    const compound = s.op !== '=';
    const rhs = await ev(s.expr, env);
    const target = await resolveTarget(s.target, env, s.visibility);
    await target.set(compound ? binaryOp(s.op.slice(0, -1), await target.get(), rhs, s.token) : rhs);
  }

  // n++  ++n  n--  --n   (prefix gives the new value, postfix gives the old one)
  async function update(e, env) {
    const target = await resolveTarget(e.target, env);
    const old = await target.get();
    if (typeof old !== 'number') throw new CITError(`'${e.op}' needs a number, but the value is ${typeOf(old)}.`, e.token.line, e.token.column);
    const next = old + (e.op === '++' ? 1 : -1);
    await target.set(next);
    return e.prefix ? next : old;
  }

  /* ---- statements ---- */

  async function exec(list, env) {
    for (const s of list) {
      if (cancelled()) throw fatal('Execution cancelled.');
      tick();
      switch (s.kind) {
        case 'empty': case 'pass': break;
        case 'block': { const r = await exec(s.body, new Env(env)); if (r) return r; break; }
        case 'with': {
          const resource = await ev(s.resource, env), scope = new Env(env);
          scope.define(s.name.value, resource, false, typeOf(resource), s.name);
          let result, failure;
          try { result = await exec(s.body, scope); } catch (err) { failure = err; }
          try { if (resource && typeof resource.close === 'function') await resource.close(); } catch (err) { if (!failure) failure = err; }
          if (failure) throw failure;
          if (result) return result;
          break;
        }
        case 'declare': {
          const values = [];
          if (s.exprs) for (const x of s.exprs) values.push(await ev(x, env));
          let unpacked = null;
          if (s.pattern && values[0] !== undefined) {
            if (!Array.isArray(values[0]) || values[0].length !== s.pattern.length) throw new CITError('A destructuring declaration needs a list or tuple with the same number of items.', s.token.line, s.token.column);
            unpacked = values[0];
          } else if (s.broadcast && values[0] !== undefined && Array.isArray(values[0]) && values[0].length === s.names.length) {
            unpacked = values[0];
          }
          const declareName = (n, v, expr) => {
            if (v && v.kind === 'function' && !v.name && expr?.kind === 'lambda') v.name = n.value;
            if (n.value === '_') return;
            const temporal = s.temporal ? (() => {
              const constraints = (s.temporal.constraints || [s.temporal]).map(constraint => ({
                ...constraint,
                expiresAt: constraint.unit === 's' && !['offline', 'stopUse'].includes(constraint.mode) ? startedAt + constraint.amount * 1000 : null,
                remainingReads: constraint.unit === 'r' ? constraint.amount : null,
                expiresLine: constraint.unit === 'l' ? n.line + constraint.amount : null
              }));
              return {
                ...constraints[0],
                constraints,
                lastUsedAt: Date.now(),
                isIdle: options.isUserIdle
              };
            })() : null;
            if (s.isStatic) {
              let root = env;
              while (root.parent) root = root.parent;
              const key = `\u0000static:${env.functionId || 'global'}:${n.value}`;
              let binding = root.values.get(key);
              if (!binding) {
                binding = { value: v, mutable: s.mutable, type: typeOf(v), temporal, width: null };
                root.values.set(key, binding);
              }
              env.values.set(n.value, binding);
            } else {
              const binding = env.define(n.value, v, s.mutable, typeOf(v), n, temporal);
              binding.reactive = Boolean(s.reactive);
              if (s.visibility && env.instance) {
                env.instance[n.value] = v;
                let fields = FIELD_ACCESS.get(env.instance);
                if (!fields) { fields = new Map(); FIELD_ACCESS.set(env.instance, fields); }
                const access = { visibility: s.visibility, owner: env.className };
                fields.set(n.value, access);
                binding.fieldAccess = access;
              }
            }
          };
          if (s.pattern) {
            s.pattern.forEach((n, i) => { if (n) declareName(n, unpacked ? unpacked[i] : null, s.exprs?.[0]); });
          } else s.names.forEach((n, i) => {
            const valueIndex = unpacked ? i : s.broadcast ? 0 : i;
            declareName(n, s.exprs ? (unpacked ? unpacked[i] : values[valueIndex]) : null, s.exprs?.[valueIndex]);
          });
          break;
        }
        case 'watch': {
          const binding = env.binding(s.name.value);
          if (!binding) throw new CITError(`Undefined variable '${s.name.value}'.`, s.name.line, s.name.column);
          if (!binding.reactive) throw new CITError(`'${s.name.value}' must be declared with 'reactive let mut' before it can be watched.`, s.name.line, s.name.column);
          binding.watchers ||= [];
          binding.watchers.push(async () => {
            const result = await exec(s.body, new Env(env));
            if (result && result.type !== RETURN) throw new CITError('A watch block cannot break or continue.');
          });
          break;
        }
        case 'typed': {
          let v = checked(await ev(s.expr, env), s.type, s.token);
          if (s.width) v = castWidth(v, s.width, s.token);
          env.define(s.name, v, false, s.type, s.token, null, s.width);
          break;
        }
        case 'assign': await assign(s, env); break;
        case 'println': case 'errorln': case 'warnln':
          {
            const parts = [];
            for (const a of s.args) parts.push(format(await ev(a, env)));   // left to right, one at a time
            emit(s.kind, parts.join(' '));
          }
          break;
        case 'expr': await ev(s.expr, env); break;
        case 'function':
          {
            let fn = { kind: 'function', name: s.name, params: s.params, body: s.body, closure: env, staticId: `function-${nextFunctionId++}` };
            for (const decorator of (s.decorators || []).reverse()) {
              const target = await ev(decorator, env);
              fn = await callValue(target, [{ name: null, value: fn }], env, 'decorator', s.token);
              if (!fn || fn.kind !== 'function') throw new CITError(`Decorator for '${s.name}' must return a function.`, s.token.line, s.token.column);
            }
            env.define(s.name, fn, false, 'function', s.token);
          }
          break;
        case 'enum': {
          const values = await ev(s.expr, env);
          if (!Array.isArray(values)) throw new CITError('An enum needs a list of values.', s.token.line, s.token.column);
          const members = {};
          for (const value of values) {
            if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
              throw new CITError('Enum values must be valid names written as strings.', s.token.line, s.token.column);
            }
            members[value] = value;
          }
          Object.freeze(members);
          env.define(s.name, members, false, 'object', s.token);
          break;
        }
        case 'class': {
          let parent = null;
          if (s.parent) {
            parent = env.get(s.parent.value, s.parent);
            if (!parent || parent.kind !== 'class') throw new CITError(`'${s.parent.value}' is not a class, so it cannot be a parent class.`, s.parent.line, s.parent.column);
            if (parent.final) throw new CITError(`Cannot inherit from final class '${parent.name}'.`, s.parent.line, s.parent.column);
          }
          const methods = {}, fields = {}, getters = {}, setters = {}, operators = {};
          for (const m of s.body) {
            if (m.kind === 'function') {
              const fn = { kind: 'function', name: m.name, params: m.params, body: m.body, closure: null, accessor: m.accessor, staticId: `method-${nextFunctionId++}` };
              if (m.accessor === 'get') getters[m.name] = fn;
              else if (m.accessor === 'set') setters[m.name] = fn;
              else methods[m.name] = fn;
            } else if (m.kind === 'operator') {
              operators[m.operator] = { kind: 'function', name: `operator ${m.operator}`, params: m.params, body: m.body, closure: null, staticId: `operator-${nextFunctionId++}` };
            } else if (m.kind === 'declare' && m.names.length === 1 && m.exprs?.length === 1) {
              fields[m.names[0].value] = { expr: m.exprs[0], mutable: m.mutable, visibility: m.visibility || null, token: m.names[0] };
            } else throw new CITError('A class can contain methods and initialized fields only.', s.token.line, s.token.column);
          }
          env.define(s.name, { kind: 'class', name: s.name, methods, getters, setters, fields, operators, parent, final: s.final }, false, 'class', s.token);
          break;
        }
        case 'if': {
          let chosen = truthy(await ev(s.condition, env)) ? s.yes : null;
          if (!chosen) for (const b of s.elseif) if (truthy(await ev(b.condition, env))) { chosen = b.body; break; }
          if (!chosen) chosen = s.no;
          if (chosen) { const r = await exec(chosen, new Env(env)); if (r) return r; }
          break;
        }
        case 'guard': {
          if (!truthy(await ev(s.condition, env))) {
            const result = await exec(s.body, new Env(env));
            if (result) return result;
            throw new CITError('A failed guard must return, break, continue, or raise.', s.body[0]?.token?.line || 1, s.body[0]?.token?.column || 1);
          }
          break;
        }
        case 'switch': {
          // No fall-through: the first matching case runs, and `break` ends the switch early.
          const value = await ev(s.subject, env);
          let chosen = null;
          for (const c of s.cases) {
            if (c.isDefault) continue;
            for (const t of c.tests) if (valuesEqual(value, await ev(t, env))) { chosen = c; break; }
            if (chosen) break;
          }
          if (!chosen) chosen = s.cases.find(c => c.isDefault) || null;
          if (chosen) {
            const r = await exec(chosen.body, new Env(env));
            if (r && r.type !== BREAK) return r;        // continue / return still reach the surrounding loop or function
          }
          break;
        }
        case 'while':
          while (truthy(await ev(s.condition, env))) {
            tick('Loop limit exceeded.');
            const r = await exec(s.body, new Env(env));
            if (r?.type === BREAK) break;
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
          break;
        case 'dowhile':
          do {
            tick('Loop limit exceeded.');
            const r = await exec(s.body, new Env(env));
            if (r?.type === BREAK) break;
            if (r && r.type !== CONTINUE) return r;    // `continue` just jumps to the condition check
          } while (truthy(await ev(s.condition, env)));
          break;
        case 'for': {
          const vals = [];
          for (const x of s.args) vals.push(await ev(x, env));
          if (!vals.every(Number.isInteger)) throw new CITError('The values in range(...) must be integers.', s.token.line, s.token.column);
          const [start, end, step] = vals.length === 1 ? [0, vals[0], 1] : vals.length === 2 ? [vals[0], vals[1], 1] : vals;
          if (step === 0) throw new CITError('The step in range(...) cannot be 0.', s.token.line, s.token.column);
          let didBreak = false;
          for (let i = start; step > 0 ? i < end : i > end; i += step) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            if (s.name !== '_') loopEnv.define(s.name, i, s.mutable, 'int', s.token);
            const r = await exec(s.body, loopEnv);
            if (r?.type === BREAK) { didBreak = true; break; }
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
          if (!didBreak && s.otherwise) { const result = await exec(s.otherwise, new Env(env)); if (result) return result; }
          break;
        }
        case 'forin': {
          const source = await ev(s.iter, env);
          let items;
          if (Array.isArray(source) || typeof source === 'string' || source instanceof Set) items = [...source];     // a copy, so the loop is safe if the list changes
          else if (source instanceof Map) items = [...source.keys()];                      // dictionaries loop over their keys
          else throw new CITError(`Cannot loop over a ${typeOf(source)}. Use a list, string or dictionary.`, s.token.line, s.token.column);
          let didBreak = false;
          for (const item of items) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            if (s.name !== '_') loopEnv.define(s.name, item, s.mutable, typeOf(item), s.token);
            const r = await exec(s.body, loopEnv);
            if (r?.type === BREAK) { didBreak = true; break; }
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
          if (!didBreak && s.otherwise) { const result = await exec(s.otherwise, new Env(env)); if (result) return result; }
          break;
        }
        case 'try': {
          let r, failure = null;
          try { r = await exec(s.body, new Env(env)); }
          catch (err) {
            if (!(err instanceof CITError) || err.fatal) failure = err;
            else {
              const handler = s.handlers.find(item => item.errorType === err.errorType)
                || s.handlers.find(item => !item.errorType);
              if (!handler) failure = err;
              else {
                const catchEnv = new Env(env);
                if (handler.name) {
                  const caught = err.hasThrown ? err.thrown : err.message;
                  catchEnv.define(handler.name.value, caught, false, typeOf(caught), handler.name);
                }
                try { r = await exec(handler.body, catchEnv); } catch (caught) { failure = caught; }
              }
            }
          }
          if (s.finallyBody) {
            try {
              const finalResult = await exec(s.finallyBody, new Env(env));
              if (finalResult) r = finalResult;
            } catch (err) { failure = err; }
          }
          if (failure) throw failure;
          if (r) return r;
          break;
        }
        case 'throw': {
          const v = await ev(s.expr, env);
          const thrown = new CITError(format(v), s.token.line, s.token.column);
          thrown.errorType = s.errorType || 'Error';
          thrown.hasThrown = true; thrown.thrown = v;
          throw thrown;
        }
        case 'defer': {
          let frame = env;
          while (frame && !frame.defers) frame = frame.parent;
          if (!frame) throw new CITError('defer can only be used inside a function or at the top level of a file.', s.token.line, s.token.column);
          frame.defers.push({ stmt: s.stmt, env });
          break;
        }
        case 'import': {
          const mod = await loadModule(s.path, s.token);
          const alias = s.alias || defaultAlias(s.path);
          env.define(alias, mod, false, 'module', s.token);
          break;
        }
        case 'importMany': {
          for (const name of s.names) {
            const mod = await loadModule(name, s.token);
            env.define(defaultAlias(name), mod, false, 'module', s.token);
          }
          break;
        }
        case 'fromImport': {
          const mod = await loadModule(s.module, s.token);
          if (!hasOwn(mod, s.name)) throw new CITError(`Module '${s.module}' has no export '${s.name}'.`, s.token.line, s.token.column);
          env.define(s.name, mod[s.name], false, typeOf(mod[s.name]), s.token);
          break;
        }
        case 'break': return { type: BREAK };
        case 'continue': return { type: CONTINUE };
        case 'return': return { type: RETURN, value: s.expr ? await ev(s.expr, env) : null };
      }
    }
    return null;
  }

  try { await withDefers(global, () => exec(ast, global)); }
  catch (error) {
    if (!(error instanceof CITExit)) throw error;
    global.exitCode = error.code;
  }
  return global;
}

// Compiling = reading the source and building the program tree. Syntax errors are reported here,
// before anything runs.
function compileBytecode(source) {
  const ast = new Parser(tokenize(source)).parse();
  return { version: 3, format: 'CIT-VM-AST-BUNDLE', source, ast };
}

async function executeBytecode(program, output = () => {}, input = async () => '', options = {}) {
  if (!program || typeof program.source !== 'string' || (program.version !== 2 && program.version !== 3)) throw new CITError('Unsupported or invalid CIT bytecode bundle.');
  const useAst = program.version === 3 && Array.isArray(program.ast);
  return run(program.source, output, input, useAst ? { ...options, ast: program.ast } : options);
}

module.exports = { CITError, tokenize, Parser, run, compileBytecode, executeBytecode };
