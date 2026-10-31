'use strict';

/*
 * CIT interpreter (tokenizer, parser, evaluator).
 *
 * v0.8 adds: compound assignment (+= -= *= /= %= **= //=), empty variables
 * (`let mut x`), multiple declaration (`let a, b = 1, 2`), do-while loops,
 * lists with methods and indexing, and the range/min/max/sum/len built-ins.
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
    if (['==', '!=', '<=', '>=', '&&', '||', '**', '//', '+=', '-=', '*=', '/=', '%='].includes(two)) {
      adv(); adv(); add('operator', two, l, c); continue;
    }
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
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
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

  parse() { const a = []; while (this.cur().type !== 'eof') a.push(this.statement()); return a; }

  block() {
    this.consume('{', "Expected '{'.");
    const a = [];
    while (!this.check('}') && this.cur().type !== 'eof') a.push(this.statement());
    this.consume('}', "Expected '}' to close block.");
    return a;
  }

  condition() { this.consume('('); const c = this.expression(); this.consume(')'); return c; }

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
      this.consume('(');
      const params = [];
      if (!this.check(')')) do {
        const p = this.ident('Expected parameter name.');
        let def = null;
        if (this.match('=')) def = this.expression();
        params.push({ name: p.value, default: def });
      } while (this.match(','));
      this.consume(')');
      return { kind: 'function', name: n.value, params, body: this.block(), token: n };
    }

    if (this.match('class')) {
      const n = this.ident('Expected class name.');
      this.consume('('); this.consume(')');
      return { kind: 'class', name: n.value, body: this.block(), token: n };
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

    if (this.match('for')) {
      this.consume('(');
      this.consume('let', "Expected 'let' in for loop.");
      const n = this.ident('Expected loop variable.');
      this.consume(',');
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
      if (!this.check(')')) do { args.push(this.expression()); } while (this.match(','));
      this.consume(')');
      return { kind, args };
    }

    // Expression statement, or an assignment: target = value, target += value, ...
    const expr = this.expression();
    const t = this.cur();
    if (t.type === 'operator' && (t.value === '=' || COMPOUND_OPS.includes(t.value))) {
      if (!['variable', 'member', 'index'].includes(expr.kind)) throw new CITError('The left side of an assignment must be a variable, property or list item.', t.line, t.column);
      this.pos++;
      return { kind: 'assign', target: expr, op: t.value, expr: this.expression(), token: t };
    }
    return { kind: 'expr', expr };
  }

  expression() { return this.binary(0); }

  binary(min) {
    let left;
    if (this.match('!', '-', '+')) { const op = this.tokens[this.pos - 1].value; left = { kind: 'unary', op, expr: this.binary(8) }; }
    else left = this.postfix();
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
      if (this.match('.')) {
        const name = this.ident('Expected property or method name.');
        e = { kind: 'member', object: e, name: name.value, token: name };
        continue;
      }
      if (this.check('[')) {
        const tok = this.cur(); this.pos++;
        const index = this.expression();
        this.consume(']', "Expected ']' after the index.");
        e = { kind: 'index', object: e, index, token: tok };
        continue;
      }
      if (this.match('(')) {
        const args = [];
        if (!this.check(')')) do {
          let name = null;
          if (this.cur().type === 'identifier' && this.peek()?.value === ':' && !LITERAL_TOKENS.includes(this.peek().type)) { name = this.cur().value; this.pos += 2; }
          args.push({ name, value: this.expression() });
        } while (this.match(','));
        this.consume(')');
        e = { kind: 'call', callee: e, args };
        continue;
      }
      break;
    }
    return e;
  }

  primary() {
    const t = this.cur();
    if (this.match('true')) return { kind: 'literal', value: true };
    if (this.match('false')) return { kind: 'literal', value: false };
    if (this.match('null')) return { kind: 'literal', value: null };
    if (['int', 'float', 'string', 'char', 'template'].includes(t.type)) {
      this.pos++;
      return { kind: 'literal', value: t.value, litType: t.type, token: t };
    }
    if (this.check('[')) {
      this.pos++;
      const items = [];
      if (!this.check(']')) do { if (this.check(']')) break; items.push(this.expression()); } while (this.match(','));
      this.consume(']', "Expected ']' to close the list.");
      return { kind: 'list', items, token: t };
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

const truthy = v => v !== false && v !== null && v !== undefined && v !== 0 && v !== '' && !(Array.isArray(v) && v.length === 0);

// How a value is printed. Strings are quoted only when they are inside a list.
function format(v, nested = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return '[' + v.map(x => format(x, true)).join(', ') + ']';
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
  return a === b;
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
    } else if ((x.type === 'int' || x.type === 'float') && typeof v === 'number') {
      x.type = x.type === 'float' || !Number.isInteger(v) ? 'float' : 'int';   // numbers can widen to float
    } else {
      checked(v, x.type, tok);
    }
    x.value = v;
  }
}

/* ------------------------------------------------------------------ */
/* List methods                                                        */
/* ------------------------------------------------------------------ */

const LIST_METHODS = {
  append:  { mutates: true, min: 1, max: 1, run: (l, [x]) => { l.push(x); return null; } },
  pop:     { mutates: true, min: 0, max: 1, run: (l, [i], err) => {
    if (!l.length) throw err('Cannot pop from an empty list.');
    let k = l.length - 1;
    if (i !== undefined) {
      if (!Number.isInteger(i)) throw err('pop() needs an integer index.');
      k = i < 0 ? i + l.length : i;
      if (k < 0 || k >= l.length) throw err(`pop index ${i} is out of range for a list of length ${l.length}.`);
    }
    return l.splice(k, 1)[0];
  } },
  insert:  { mutates: true, min: 2, max: 2, run: (l, [i, x], err) => {
    if (!Number.isInteger(i)) throw err('insert() needs an integer index.');
    l.splice(i < 0 ? Math.max(0, l.length + i) : Math.min(i, l.length), 0, x);
    return null;
  } },
  clear:   { mutates: true, min: 0, max: 0, run: l => { l.length = 0; return null; } },
  remove:  { mutates: true, min: 1, max: 1, run: (l, [x], err) => {
    const k = l.findIndex(y => valuesEqual(y, x));
    if (k < 0) throw err(`remove(): ${format(x, true)} is not in the list.`);
    l.splice(k, 1);
    return null;
  } },
  reverse: { mutates: true, min: 0, max: 0, run: l => { l.reverse(); return null; } },
  count:   { min: 1, max: 1, run: (l, [x]) => l.filter(y => valuesEqual(y, x)).length },
  index:   { min: 1, max: 1, run: (l, [x], err) => {
    const k = l.findIndex(y => valuesEqual(y, x));
    if (k < 0) throw err(`index(): ${format(x, true)} is not in the list.`);
    return k;
  } },
  copy:    { min: 0, max: 0, run: l => l.slice() }
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

  /* ---- expressions ---- */

  async function ev(e, env) {
    switch (e.kind) {
      case 'literal': return e.litType === 'template' ? interpolate(e.value, env) : e.value;
      case 'variable': return env.get(e.name, e.token);
      case 'list': { const out = []; for (const item of e.items) out.push(await ev(item, env)); return out; }
      case 'index': return readIndex(await ev(e.object, env), await ev(e.index, env), e.token);
      case 'member': return readMember(await ev(e.object, env), e);
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
    const isList = Array.isArray(o);
    if (!isList && typeof o !== 'string') throw fail(`Only lists and strings can be indexed, not ${typeOf(o)}.`);
    if (!Number.isInteger(i)) throw fail('An index must be an integer.');
    const items = isList ? o : [...o];
    const k = i < 0 ? i + items.length : i;
    if (k < 0 || k >= items.length) throw fail(`Index ${i} is out of range for a ${isList ? 'list' : 'string'} of length ${items.length}.`);
    return items[k];
  }

  function readMember(o, e) {
    const tok = e.token || { line: 1, column: 1 };
    if (o === null || o === undefined) throw new CITError(`Cannot read '${e.name}' from null.`, tok.line, tok.column);
    if (Array.isArray(o)) {
      if (hasOwn(LIST_METHODS, e.name)) throw new CITError(`'${e.name}' is a list method. Call it like list.${e.name}(...).`, tok.line, tok.column);
      throw new CITError(`Lists have no property '${e.name}'.`, tok.line, tok.column);
    }
    if (typeof o !== 'object') throw new CITError(`Cannot read '${e.name}' from a ${typeOf(o)}.`, tok.line, tok.column);
    if (o.__module && !hasOwn(o, e.name)) throw new CITError(`Module '${o.__module}' has no export '${e.name}'.`, tok.line, tok.column);
    return hasOwn(o, e.name) ? o[e.name] : null;
  }

  // Lists declared with plain `let` (not `let mut`) cannot be changed through that variable.
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
      const obj = await ev(callee.object, env);
      const tok = callee.token || { line: 1, column: 1 };
      if (Array.isArray(obj)) return listMethod(obj, e, env);
      if (obj === null || obj === undefined || typeof obj !== 'object' || !hasOwn(obj, callee.name) || typeof obj[callee.name] !== 'function') {
        throw new CITError(`'${callee.name}' is not a method.`, tok.line, tok.column);
      }
      const vals = [];
      for (const a of e.args) vals.push(await ev(a.value, env));
      return await obj[callee.name](...vals);
    }

    const vals = [];
    for (const a of e.args) vals.push({ name: a.name, value: await ev(a.value, env) });

    if (callee.kind === 'variable') {
      const name = callee.name;
      if (BUILTINS.has(name) && !env.find(name)) return builtin(name, vals, callee.token);
      return callValue(env.get(name, callee.token), vals, env, name, callee.token);
    }
    return callValue(await ev(callee, env), vals, env, 'this value', callee.token);
  }

  async function callValue(target, vals, env, name, tok = { line: 1, column: 1 }) {
    if (target && target.kind === 'class') return construct(target, vals, env);
    if (target && target.kind === 'function') return invoke(target, vals, env);
    if (typeof target === 'function') return await target(...vals.map(v => v.value));
    throw new CITError(`'${name}' is not callable.`, tok.line, tok.column);
  }

  async function listMethod(list, e, env) {
    const name = e.callee.name, tok = e.callee.token || { line: 1, column: 1 };
    const def = hasOwn(LIST_METHODS, name) ? LIST_METHODS[name] : null;
    if (!def) throw new CITError(`Lists have no method '${name}'.`, tok.line, tok.column);
    const err = msg => new CITError(msg, tok.line, tok.column);
    const vals = [];
    for (const a of e.args) vals.push(await ev(a.value, env));
    if (vals.length < def.min || vals.length > def.max) {
      const want = def.min === def.max ? `${def.min}` : `${def.min} to ${def.max}`;
      throw err(`list.${name}() takes ${want} value${def.max === 1 ? '' : 's'} but got ${vals.length}.`);
    }
    if (def.mutates) requireMutable(e.callee.object, env, 'change list', tok);
    return def.run(list, vals, err);
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
        if (args.length !== 1 || !(Array.isArray(args[0]) || typeof args[0] === 'string')) throw err('len() takes one list or string.');
        return Array.isArray(args[0]) ? args[0].length : [...args[0]].length;
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

  async function construct(cls, args, env) {
    const instance = { __class: cls.name };
    const instanceEnv = new Env(env);
    for (const [n, m] of Object.entries(cls.methods)) {
      instance[n] = async (...raw) => invoke(m, raw.map(value => ({ name: null, value })), instanceEnv);
    }
    instanceEnv.define('self', instance, false);
    if (cls.methods.struct) await invoke(cls.methods.struct, args, instanceEnv);
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

  /* ---- statements ---- */

  async function assign(s, env) {
    const t = s.target, compound = s.op !== '=';
    const op = s.op.slice(0, -1);
    const rhs = await ev(s.expr, env);

    if (t.kind === 'variable') {
      env.set(t.name, compound ? binaryOp(op, env.get(t.name, t.token), rhs, s.token) : rhs, t.token);
      return;
    }
    if (t.kind === 'member') {
      const o = await ev(t.object, env);
      if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new CITError(`Cannot set '${t.name}' on a ${typeOf(o)}.`, t.token.line, t.token.column);
      o[t.name] = compound ? binaryOp(op, hasOwn(o, t.name) ? o[t.name] : null, rhs, s.token) : rhs;
      return;
    }
    // list item: nums[0] = value
    const list = await ev(t.object, env);
    const i = await ev(t.index, env);
    if (!Array.isArray(list)) throw new CITError(`Only list items can be assigned, not items of a ${typeOf(list)}.`, t.token.line, t.token.column);
    requireMutable(t.object, env, 'change list', t.token);
    const current = readIndex(list, i, t.token);
    list[i < 0 ? i + list.length : i] = compound ? binaryOp(op, current, rhs, s.token) : rhs;
  }

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
            env.define(n.value, v, s.mutable, typeOf(v), n);
          });
          break;
        }
        case 'typed': { const v = await ev(s.expr, env); env.define(s.name, checked(v, s.type, s.token), false, s.type, s.token); break; }
        case 'assign': await assign(s, env); break;
        case 'println': case 'errorln': case 'warnln':
          emit(s.kind, (await Promise.all(s.args.map(a => ev(a, env)))).map(v => format(v)).join(' '));
          break;
        case 'expr': await ev(s.expr, env); break;
        case 'function':
          env.define(s.name, { kind: 'function', name: s.name, params: s.params, body: s.body, closure: env }, false, 'function', s.token);
          break;
        case 'class': {
          const methods = {};
          for (const m of s.body) {
            if (m.kind !== 'function') throw new CITError('Only methods can be declared directly inside a class.');
            methods[m.name] = { kind: 'function', name: m.name, params: m.params, body: m.body, closure: null };
          }
          env.define(s.name, { kind: 'class', name: s.name, methods }, false, 'class', s.token);
          break;
        }
        case 'if': {
          let chosen = truthy(await ev(s.condition, env)) ? s.yes : null;
          if (!chosen) for (const b of s.elseif) if (truthy(await ev(b.condition, env))) { chosen = b.body; break; }
          if (!chosen) chosen = s.no;
          if (chosen) { const r = await exec(chosen, new Env(env)); if (r) return r; }
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
