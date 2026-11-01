'use strict';

/*
 * CIT interpreter (tokenizer, parser, evaluator).
 *
 * v0.8.1 adds: dictionaries, ++/--, many list/dictionary/string methods,
 * for-in loops, safe navigation (?.), lambdas, class inheritance (super()),
 * and switch/case.
 */

class CITError extends Error {
  constructor(message, line = 1, column = 1) {
    super(message);
    this.name = 'CITError';
    this.line = line;
    this.column = column;
  }
}

const BREAK = Symbol('break'), CONTINUE = Symbol('continue'), RETURN = Symbol('return');
const COMPOUND_OPS = ['+=', '-=', '*=', '/=', '%=', '**=', '//='];
const TYPE_WORDS = ['int', 'float', 'str', 'char', 'bool'];
const LITERAL_TOKENS = ['string', 'char', 'template'];
const ASSIGNABLE = ['variable', 'member', 'index'];
const PRECEDENCE = new Map(Object.entries({
  '||': 1, or: 1, '&&': 2, and: 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '**': 7
}));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

function tokenize(source) {
  const out = [];
  let i = 0, line = 1, col = 1;
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
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '**', '//', '+=', '-=', '*=', '/=', '%=', '++', '--', '=>'].includes(two)) {
      adv(); adv(); add('operator', two, l, c); continue;
    }
    if (two === '?.') { adv(); adv(); add('punctuation', '?.', l, c); continue; }
    if ('+-*/%<>=!'.includes(ch)) { adv(); add('operator', ch, l, c); continue; }
    if ('(){}[];,.:'.includes(ch)) { adv(); add('punctuation', ch, l, c); continue; }
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
  constructor(tokens) { this.tokens = tokens; this.pos = 0; this.inArgs = false; }
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
    this.withArgs(() => {
      if (!this.check(')')) do {
        const p = this.ident('Expected parameter name.');
        let def = null;
        if (this.match('=')) def = this.expression();
        params.push({ name: p.value, default: def });
      } while (this.match(','));
    });
    this.consume(')');
    return params;
  }

  // let [mut] name                       (empty variable, needs mut)
  // let [mut] name = value
  // let [mut] a, b, c = 1, 2, 3          (multiple variables)
  declaration() {
    this.consume('let');
    const mutable = this.match('mut');
    const names = [this.ident('Expected variable name after let.')];
    while (this.match(',')) names.push(this.ident("Expected another variable name after ','."));
    const first = names[0];
    const list = names.map(n => n.value).join(', ');

    if (!this.match('=')) {
      if (!mutable) {
        throw new CITError(`'${list}' has no value, so it must be declared with 'let mut'. Example: let mut ${list}`, first.line, first.column);
      }
      return { kind: 'declare', names, mutable, exprs: null };
    }
    const exprs = [this.expression()];
    while (this.match(',')) exprs.push(this.expression());
    if (exprs.length !== names.length) {
      throw new CITError(`Expected ${names.length} value${names.length === 1 ? '' : 's'} for ${list} but found ${exprs.length}.`, first.line, first.column);
    }
    return { kind: 'declare', names, mutable, exprs };
  }

  statement() {
    if (this.match(';')) return { kind: 'empty' };
    if (this.check('let')) return this.declaration();

    if (this.cur().type === 'identifier' && TYPE_WORDS.includes(this.cur().value)) {
      const type = this.cur().value; this.pos++;
      const n = this.ident();
      this.consume('=');
      return { kind: 'typed', name: n.value, type, expr: this.expression(), token: n };
    }

    if (this.match('fn')) {
      const n = this.ident('Expected function name.');
      const params = this.params();
      return { kind: 'function', name: n.value, params, body: this.block(), token: n };
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
      return { kind: 'class', name: n.value, parent, body: this.block(), token: n };
    }

    if (this.match('if')) {
      const condition = this.condition();
      const yes = this.block(), elseif = [];
      while (this.match('elseif')) { const c = this.condition(); elseif.push({ condition: c, body: this.block() }); }
      const no = this.match('else') ? this.block() : null;
      return { kind: 'if', condition, yes, elseif, no };
    }

    if (this.match('while')) { const condition = this.condition(); return { kind: 'while', condition, body: this.block() }; }

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

    if (this.match('for')) {
      this.consume('(');
      this.consume('let', "Expected 'let' in for loop.");
      const n = this.ident('Expected loop variable.');
      if (this.match('in')) {                                   // for (let item in list)
        const iter = this.expression();
        this.consume(')');
        return { kind: 'forin', name: n.value, iter, body: this.block(), token: n };
      }
      this.consume(',');                                        // for (let i, range = 0, 5)
      this.consume('range', "Expected 'range' in for loop.");
      this.consume('=');
      const start = this.expression();
      this.consume(',');
      const end = this.expression();
      this.consume(')');
      return { kind: 'for', name: n.value, start, end, body: this.block(), token: n };
    }

    if (this.match('import')) {
      const t = this.cur();
      if (t.type !== 'string') throw new CITError("Expected a package or file name in quotes after 'import'.", t.line, t.column);
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
      if (!ASSIGNABLE.includes(expr.kind)) throw new CITError('The left side of an assignment must be a variable, property, list item or dictionary item.', t.line, t.column);
      this.pos++;
      return { kind: 'assign', target: expr, op: t.value, expr: this.expression(), token: t };
    }
    return { kind: 'expr', expr };
  }

  expression() { return this.binary(0); }

  binary(min) {
    let left;
    const t0 = this.cur();
    if ((this.check('++') || this.check('--'))) {                // ++n  --n
      this.pos++;
      const target = this.postfix();
      if (!ASSIGNABLE.includes(target.kind)) throw new CITError(`'${t0.value}' needs a variable, property or list item.`, t0.line, t0.column);
      left = { kind: 'update', op: t0.value, prefix: true, target, token: t0 };
    } else if (this.match('!', '-', '+')) {
      left = { kind: 'unary', op: t0.value, expr: this.binary(8) };
    } else left = this.postfix();
    for (;;) {
      const t = this.cur();
      const isOp = t.type === 'operator' || (t.type === 'identifier' && (t.value === 'and' || t.value === 'or'));
      const p = isOp ? PRECEDENCE.get(t.value) : undefined;
      if (p === undefined || p < min) break;
      this.pos++;
      const right = this.binary(p + (t.value === '**' ? 0 : 1));
      left = { kind: 'binary', op: t.value, left, right, token: t };
    }
    return left;
  }

  postfix() {
    let e = this.primary();
    for (;;) {
      if (this.check('.') || this.check('?.')) {
        const optional = this.cur().value === '?.';
        this.pos++;
        const name = this.ident('Expected property or method name.');
        e = { kind: 'member', object: e, name: name.value, optional, token: name };
        continue;
      }
      if (this.check('[')) {
        const tok = this.cur(); this.pos++;
        const index = this.withArgs(() => this.expression());
        this.consume(']', "Expected ']' after the index.");
        e = { kind: 'index', object: e, index, token: tok };
        continue;
      }
      if (this.match('(')) {
        const args = [];
        this.withArgs(() => {
          if (!this.check(')')) do {
            let name = null;
            if (this.cur().type === 'identifier' && this.peek()?.value === ':' && !LITERAL_TOKENS.includes(this.peek().type)) { name = this.cur().value; this.pos += 2; }
            args.push({ name, value: this.expression() });
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

    if (this.match('true')) return { kind: 'literal', value: true };
    if (this.match('false')) return { kind: 'literal', value: false };
    if (this.match('null')) return { kind: 'literal', value: null };
    if (['int', 'float', 'string', 'char', 'template'].includes(t.type)) {
      this.pos++;
      return { kind: 'literal', value: t.value, litType: t.type, token: t };
    }

    if (this.check('[')) {                                        // list
      this.pos++;
      const items = [];
      this.withArgs(() => { if (!this.check(']')) do { if (this.check(']')) break; items.push(this.expression()); } while (this.match(',')); });
      this.consume(']', "Expected ']' to close the list.");
      return { kind: 'list', items, token: t };
    }

    if (this.check('{')) {                                        // dictionary: {name: "Coder", age: 24}
      this.pos++;
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

    if (this.match('(')) { const e = this.expression(); this.consume(')'); return e; }
    if (t.type === 'identifier') { this.pos++; return { kind: 'variable', name: t.value, token: t }; }
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
  if (Array.isArray(v)) return 'list';
  if (v instanceof Map) return 'dict';
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

const truthy = v => v !== false && v !== null && v !== undefined && v !== 0 && v !== ''
  && !(Array.isArray(v) && v.length === 0) && !(v instanceof Map && v.size === 0);

function formatKey(k) {
  return typeof k === 'string' ? (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k)) : String(k);
}

// How a value is printed. Strings are quoted only when they are inside a list or dictionary.
function format(v, nested = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return '[' + v.map(x => format(x, true)).join(', ') + ']';
  if (v instanceof Map) return '{' + [...v].map(([k, x]) => `${formatKey(k)}: ${format(x, true)}`).join(', ') + '}';
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
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, x]) => b.has(k) && valuesEqual(x, b.get(k)));
  return a === b;
}

function dictKey(k, tok = { line: 1, column: 1 }) {
  if (typeof k === 'string' || typeof k === 'boolean' || (typeof k === 'number' && !Number.isNaN(k))) return k;
  throw new CITError(`Dictionary keys must be strings, numbers or booleans, not ${typeOf(k)}.`, tok.line, tok.column);
}

class Env {
  constructor(parent = null) { this.parent = parent; this.values = new Map(); }
  find(n) { if (this.values.has(n)) return this; return this.parent ? this.parent.find(n) : null; }
  binding(n) { const e = this.find(n); return e ? e.values.get(n) : null; }
  get(n, tok) {
    const e = this.find(n);
    if (!e) throw new CITError(`Undefined variable '${n}'.`, tok?.line || 1, tok?.column || 1);
    return e.values.get(n).value;
  }
  define(n, v, mutable = true, type = typeOf(v), tok = { line: 1, column: 1 }) {
    if (this.values.has(n)) throw new CITError(`'${n}' is already declared.`, tok.line, tok.column);
    const b = { value: v, mutable, type };
    this.values.set(n, b);
    return b;
  }
  set(n, v, tok = { line: 1, column: 1 }) {
    const e = this.find(n);
    if (!e) throw new CITError(`Undefined variable '${n}'.`, tok.line, tok.column);
    const x = e.values.get(n);
    if (!x.mutable) throw new CITError(`Cannot reassign immutable variable '${n}'. Use 'let mut'.`, tok.line, tok.column);
    if (x.type === 'null') {
      x.type = typeOf(v);                       // an empty variable takes the type of its first value
    } else if (v === null && x.type === 'object') {
      // an object variable may be set back to null (works together with ?.)
    } else if ((x.type === 'int' || x.type === 'float') && typeof v === 'number') {
      x.type = x.type === 'float' || !Number.isInteger(v) ? 'float' : 'int';   // numbers can widen to float
    } else {
      checked(v, x.type, tok);
    }
    x.value = v;
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
  } }
};

const BUILTINS = new Set(['input', 'castInt', 'castFloat', 'castString', 'castBool', 'range', 'min', 'max', 'sum', 'len']);

/* ------------------------------------------------------------------ */
/* Interpreter                                                         */
/* ------------------------------------------------------------------ */

async function run(source, output = () => {}, input = async prompt => '', options = {}) {
  const ast = new Parser(tokenize(source)).parse();
  const global = new Env();
  const maxSteps = options.maxSteps || 1000000;
  let steps = 0;
  const tick = (msg = 'Execution step limit exceeded. Possible infinite loop.') => { if (++steps > maxSteps) throw new CITError(msg); };
  const emit = (kind, msg) => {
    const line = String(msg);
    if (kind === 'errorln') output(`[ERROR] ${line}`, 'error');
    else if (kind === 'warnln') output(`[WARNING] ${line}`, 'warn');
    else output(line, 'out');
  };
  const cancelled = () => typeof options.isCancelled === 'function' && options.isCancelled();
  let currentDir = options.baseDir || null;
  const moduleCache = new Map(), loading = new Set();
  const SHORT = Symbol('short-circuit');      // result of a ?. chain that hit null

  /* ---- expressions ---- */

  async function ev(e, env) { const v = await evx(e, env); return v === SHORT ? null : v; }

  async function evx(e, env) {
    switch (e.kind) {
      case 'literal': return e.litType === 'template' ? interpolate(e.value, env) : e.value;
      case 'variable': return env.get(e.name, e.token);
      case 'list': { const out = []; for (const item of e.items) out.push(await ev(item, env)); return out; }
      case 'dict': {
        const d = new Map();
        for (const en of e.entries) d.set(dictKey(await ev(en.key, env), en.key.token), await ev(en.value, env));
        return d;
      }
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
      case 'member': {
        const o = await evx(e.object, env);
        if (o === SHORT) return SHORT;
        if (e.optional && (o === null || o === undefined)) return SHORT;
        return readMember(o, e);
      }
      case 'update': return update(e, env);
      case 'unary': {
        const v = await ev(e.expr, env);
        if (e.op === '!') return !truthy(v);
        if (typeof v !== 'number') throw new CITError(`Unary '${e.op}' requires a number.`);
        return e.op === '-' ? -v : v;
      }
      case 'binary': {
        const a = await ev(e.left, env);
        if (e.op === '&&' || e.op === 'and') return truthy(a) && truthy(await ev(e.right, env));
        if (e.op === '||' || e.op === 'or') return truthy(a) || truthy(await ev(e.right, env));
        return binaryOp(e.op, a, await ev(e.right, env), e.token);
      }
      case 'call': return call(e, env);
      default: throw new CITError('Invalid expression.');
    }
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
    if (op === '+') {
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      throw fail(`Invalid operands for '+' (${typeOf(a)} and ${typeOf(b)}).`);
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

  function readMember(o, e) {
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
    if (typeof o === 'string' && hasOwn(STRING_METHODS, e.name)) throw new CITError(`'${e.name}' is a string method. Call it like s.${e.name}(...).`, tok.line, tok.column);
    if (typeof o !== 'object') throw new CITError(`Cannot read '${e.name}' from a ${typeOf(o)}.`, tok.line, tok.column);
    if (o.__module && !hasOwn(o, e.name)) throw new CITError(`Module '${o.__module}' has no export '${e.name}'.`, tok.line, tok.column);
    return hasOwn(o, e.name) ? o[e.name] : null;
  }

  // Lists and dictionaries declared with plain `let` (not `let mut`) cannot be changed through that variable.
  function requireMutable(objExpr, env, action, tok) {
    if (objExpr.kind !== 'variable') return;
    const b = env.binding(objExpr.name);
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
          const value = await ev(new Parser(tokenize(s.slice(i + 1, end))).expression(), env);
          result += format(value);
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
      if (Array.isArray(obj)) return invokeMethod(obj, 'list', 'Lists', LIST_METHODS, e, env);
      if (obj instanceof Map) return invokeMethod(obj, 'dictionary', 'Dictionaries', DICT_METHODS, e, env);
      if (typeof obj === 'string') return invokeMethod(obj, 'string', 'Strings', STRING_METHODS, e, env);
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
      call: (fn, ...args) => callValue(fn, args.map(value => ({ name: null, value })), env, 'callback', tok)
    };
    return await def.run(obj, vals, ctx);
  }

  async function builtin(name, vals, tok = { line: 1, column: 1 }) {
    const err = msg => new CITError(msg, tok.line, tok.column);
    const args = vals.map(v => v.value);
    switch (name) {
      case 'input': return String(await input(args.length ? format(args[0]) : ''));
      case 'castInt': return Math.trunc(Number(args[0]));
      case 'castFloat': return Number(args[0]);
      case 'castString': return format(args[0]);
      case 'castBool': {
        const x = args[0];
        if (typeof x === 'string') {
          const z = x.trim().toLowerCase();
          if (['false', '0', 'no', 'off', ''].includes(z)) return false;
          if (['true', '1', 'yes', 'on'].includes(z)) return true;
        }
        return truthy(x);
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
    }
    throw err(`Unknown built-in '${name}'.`);
  }

  async function invoke(fn, args, parent) {
    const local = new Env(fn.closure || parent);
    let pos = 0;
    for (const p of fn.params) {
      const named = args.find(a => a.name === p.name);
      let v;
      if (named) v = named.value;
      else if (pos < args.length && !args[pos].name) v = args[pos++].value;
      else if (p.default !== null) v = await ev(p.default, local);
      else throw new CITError(`Missing argument '${p.name}'.`);
      local.define(p.name, v, false).param = true;   // parameters can't be reassigned, but a list passed in can be changed
    }
    const r = await exec(fn.body, local);
    return r && r.type === RETURN ? r.value : null;
  }

  // Creates an instance. For `class child(parent())` the parent's methods come first and the child's
  // methods override them; super() inside a method gives access to the parent's version.
  async function construct(cls, args, env) {
    const chain = [];
    for (let c = cls; c; c = c.parent) chain.unshift(c);          // root class first
    const instance = { __class: cls.name };
    const instanceEnv = new Env(env);
    instanceEnv.define('self', instance, false);

    const tables = [];
    let structFn = null, structEnv = null;
    chain.forEach((c, i) => {
      const levelEnv = new Env(instanceEnv);
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
    });
    const merged = upto => Object.assign({}, ...tables.slice(0, upto + 1));
    const parentView = i => Object.assign(merged(i), { __class: chain[i].name });

    Object.assign(instance, merged(chain.length - 1));
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
      try { await exec(new Parser(tokenize(r.source)).parse(), menv); }
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
  async function resolveTarget(t, env) {
    if (t.kind === 'variable') return { get: () => env.get(t.name, t.token), set: v => env.set(t.name, v, t.token) };
    if (t.kind === 'member') {
      if (t.optional) throw new CITError("A safe '?.' cannot be used on the left side of an assignment.", t.token.line, t.token.column);
      const o = await ev(t.object, env);
      if (o === null || typeof o !== 'object' || Array.isArray(o) || o instanceof Map) {
        throw new CITError(`Cannot set '${t.name}' on a ${typeOf(o)}.`, t.token.line, t.token.column);
      }
      return { get: () => (hasOwn(o, t.name) ? o[t.name] : null), set: v => { o[t.name] = v; } };
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
    const compound = s.op !== '=';
    const rhs = await ev(s.expr, env);
    const target = await resolveTarget(s.target, env);
    target.set(compound ? binaryOp(s.op.slice(0, -1), target.get(), rhs, s.token) : rhs);
  }

  // n++  ++n  n--  --n   (prefix gives the new value, postfix gives the old one)
  async function update(e, env) {
    const target = await resolveTarget(e.target, env);
    const old = target.get();
    if (typeof old !== 'number') throw new CITError(`'${e.op}' needs a number, but the value is ${typeOf(old)}.`, e.token.line, e.token.column);
    const next = old + (e.op === '++' ? 1 : -1);
    target.set(next);
    return e.prefix ? next : old;
  }

  /* ---- statements ---- */

  async function exec(list, env) {
    for (const s of list) {
      if (cancelled()) throw new CITError('Execution cancelled.');
      tick();
      switch (s.kind) {
        case 'empty': case 'pass': break;
        case 'block': { const r = await exec(s.body, new Env(env)); if (r) return r; break; }
        case 'declare': {
          const values = [];
          if (s.exprs) for (const x of s.exprs) values.push(await ev(x, env));
          s.names.forEach((n, i) => {
            const v = s.exprs ? values[i] : null;       // empty variables start as null
            if (v && v.kind === 'function' && !v.name && s.exprs[i].kind === 'lambda') v.name = n.value;   // let f = x => x  is called "f"
            env.define(n.value, v, s.mutable, typeOf(v), n);
          });
          break;
        }
        case 'typed': { const v = await ev(s.expr, env); env.define(s.name, checked(v, s.type, s.token), false, s.type, s.token); break; }
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
          env.define(s.name, { kind: 'function', name: s.name, params: s.params, body: s.body, closure: env }, false, 'function', s.token);
          break;
        case 'class': {
          let parent = null;
          if (s.parent) {
            parent = env.get(s.parent.value, s.parent);
            if (!parent || parent.kind !== 'class') throw new CITError(`'${s.parent.value}' is not a class, so it cannot be a parent class.`, s.parent.line, s.parent.column);
          }
          const methods = {};
          for (const m of s.body) {
            if (m.kind !== 'function') throw new CITError('Only methods can be declared directly inside a class.');
            methods[m.name] = { kind: 'function', name: m.name, params: m.params, body: m.body, closure: null };
          }
          env.define(s.name, { kind: 'class', name: s.name, methods, parent }, false, 'class', s.token);
          break;
        }
        case 'if': {
          let chosen = truthy(await ev(s.condition, env)) ? s.yes : null;
          if (!chosen) for (const b of s.elseif) if (truthy(await ev(b.condition, env))) { chosen = b.body; break; }
          if (!chosen) chosen = s.no;
          if (chosen) { const r = await exec(chosen, new Env(env)); if (r) return r; }
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
          const start = Number(await ev(s.start, env)), end = Number(await ev(s.end, env));
          if (!Number.isInteger(start) || !Number.isInteger(end)) throw new CITError('for range values must be integers.');
          for (let i = start; i < end; i++) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            loopEnv.define(s.name, i, false, 'int', s.token);
            const r = await exec(s.body, loopEnv);
            if (r?.type === BREAK) break;
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
          break;
        }
        case 'forin': {
          const source = await ev(s.iter, env);
          let items;
          if (Array.isArray(source) || typeof source === 'string') items = [...source];     // a copy, so the loop is safe if the list changes
          else if (source instanceof Map) items = [...source.keys()];                      // dictionaries loop over their keys
          else throw new CITError(`Cannot loop over a ${typeOf(source)}. Use a list, string or dictionary.`, s.token.line, s.token.column);
          for (const item of items) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            loopEnv.define(s.name, item, false, typeOf(item), s.token);
            const r = await exec(s.body, loopEnv);
            if (r?.type === BREAK) break;
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
          break;
        }
        case 'import': {
          const mod = await loadModule(s.path, s.token);
          env.define(s.alias || defaultAlias(s.path), mod, false, 'module', s.token);
          break;
        }
        case 'break': return { type: BREAK };
        case 'continue': return { type: CONTINUE };
        case 'return': return { type: RETURN, value: s.expr ? await ev(s.expr, env) : null };
      }
    }
    return null;
  }

  await exec(ast, global);
  return global;
}

function compileBytecode(source) { return { version: 2, format: 'CIT-VM-SOURCE-BUNDLE', source }; }

async function executeBytecode(program, output = () => {}, input = async () => '', options = {}) {
  if (!program || program.version !== 2 || typeof program.source !== 'string') throw new CITError('Unsupported or invalid CIT bytecode bundle.');
  return run(program.source, output, input, options);
}

module.exports = { CITError, tokenize, Parser, run, compileBytecode, executeBytecode };
