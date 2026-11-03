'use strict';
const fs = require('fs');
const path = require('path');

/*
 * CIT interpreter (tokenizer, parser, evaluator).
 *
 * v0.8.3 adds temporal variables, sets/tuples, math/UI modules, typed errors,
 * decorators, enums, UTF-8 files, and additional built-ins.
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

const BREAK = Symbol('break'), CONTINUE = Symbol('continue'), RETURN = Symbol('return');
const COMPOUND_OPS = ['+=', '-=', '*=', '/=', '%=', '**=', '//='];
const TYPE_WORDS = ['int', 'float', 'str', 'char', 'bool'];
const LITERAL_TOKENS = ['string', 'char', 'template'];
const ASSIGNABLE = ['variable', 'member', 'index'];
const DEFER_KINDS = ['println', 'errorln', 'warnln', 'expr', 'assign', 'block', 'if', 'while', 'dowhile', 'for', 'forin', 'switch', 'try', 'throw', 'pass'];
const PRECEDENCE = new Map(Object.entries({
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, in: 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '**': 7
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
    if (three === '...') { adv(); adv(); adv(); add('punctuation', three, l, c); continue; }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '**', '//', '+=', '-=', '*=', '/=', '%=', '++', '--', '=>'].includes(two)) {
      adv(); adv(); add('operator', two, l, c); continue;
    }
    if (two === '?.') { adv(); adv(); add('punctuation', '?.', l, c); continue; }
    if ('+-*/%<>=!'.includes(ch)) { adv(); add('operator', ch, l, c); continue; }
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
        const name = p.value === 'ui' && this.match('.') ? `ui.${this.ident('Expected title after ui.').value}` : p.value;
        let def = null;
        if (this.match('=')) def = this.expression();
        params.push({ name, default: def });
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
    let temporal = null;
    if (this.match('<')) {
      const duration = this.cur();
      if (duration.type !== 'int' || !this.tokens[this.pos + 1] || !['s', 'l'].includes(this.tokens[this.pos + 1].value)) {
        throw new CITError("Expected a temporal duration such as '<2s>' or '<30l>'.", duration.line, duration.column);
      }
      this.pos++;
      temporal = { amount: duration.value, unit: this.cur().value };
      this.pos++;
      this.consume('>', "Expected '>' after the temporal duration.");
      if (temporal.amount <= 0) throw new CITError('A temporal duration must be greater than 0.', duration.line, duration.column);
    }
    const first = names[0];
    const list = names.map(n => n.value).join(', ');

    if (!this.match('=')) {
      if (!mutable) {
        throw new CITError(`'${list}' has no value, so it must be declared with 'let mut'. Example: let mut ${list}`, first.line, first.column);
      }
      return { kind: 'declare', names, mutable, exprs: null, temporal };
    }
    const exprs = [this.expression()];
    while (this.match(',')) exprs.push(this.expression());
    if (exprs.length !== names.length && !(exprs.length === 1 && names.length > 1)) {
      throw new CITError(`Expected ${names.length} value${names.length === 1 ? '' : 's'} for ${list} but found ${exprs.length}.`, first.line, first.column);
    }
    return { kind: 'declare', names, mutable, exprs, temporal, broadcast: exprs.length === 1 && names.length > 1 };
  }

  statement() {
    if (this.match(';')) return { kind: 'empty' };
    if (this.check('private') || this.check('protected')) {
      const visibility = this.cur().value;
      const modifier = this.cur(); this.pos++;
      const statement = this.statement();
      if (statement.kind !== 'assign' || statement.target.kind !== 'member' || statement.target.object.kind !== 'variable' || statement.target.object.name !== 'self') {
        throw new CITError(`${visibility} can only be used on a self field assignment inside a class.`, modifier.line, modifier.column);
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

    if (this.cur().type === 'identifier' && TYPE_WORDS.includes(this.cur().value)) {
      const type = this.cur().value; this.pos++;
      const n = this.ident();
      this.consume('=');
      return { kind: 'typed', name: n.value, type, expr: this.expression(), token: n };
    }

    if (this.match('fn')) {
      const n = this.ident('Expected function name.');
      const params = this.params();
      const title = params.find(p => p.name === 'ui.title');
      return { kind: 'function', name: n.value, params: params.filter(p => p.name !== 'ui.title'), uiTitle: title?.default || null, body: this.block(), token: n };
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
        return { kind: 'forin', name: n.value, mutable, iter, body: this.block(), token: n };
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
      return { kind: 'for', name: n.value, mutable, args, body: this.block(), token: n };
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
      if (t.type !== 'string' && !(t.type === 'identifier' && ['math', 'ui'].includes(t.value))) throw new CITError("Expected a package or file name after 'import'.", t.line, t.column);
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
            const nx = this.peek();
            if (this.cur().type === 'identifier' && nx && ((nx.type === 'punctuation' && nx.value === ':') || (nx.type === 'operator' && nx.value === '='))) { name = this.cur().value; this.pos += 2; }
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
      this.withArgs(() => { if (!this.check(']')) do { if (this.check(']')) break; items.push(this.expression()); } while (this.match(',')); });
      this.consume(']', "Expected ']' to close the list.");
      return { kind: 'list', items, token: t };
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

const truthy = v => v !== false && v !== null && v !== undefined && v !== 0 && v !== ''
  && !(Array.isArray(v) && v.length === 0) && !(v instanceof Map && v.size === 0);

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
      const expired = binding.temporal.unit === 's'
        ? Date.now() >= binding.temporal.expiresAt
        : (tok?.line || 1) > binding.temporal.expiresLine;
      if (expired) throw new CITError(`Temporal variable '${n}' has expired.`, tok?.line || 1, tok?.column || 1);
    }
    return binding.value;
  }
  define(n, v, mutable = true, type = typeOf(v), tok = { line: 1, column: 1 }, temporal = null) {
    if (this.values.has(n)) throw new CITError(`'${n}' is already declared.`, tok.line, tok.column);
    const b = { value: v, mutable, type, temporal };
    this.values.set(n, b);
    return b;
  }
  set(n, v, tok = { line: 1, column: 1 }) {
    const e = this.find(n);
    if (!e) throw new CITError(`Undefined variable '${n}'.`, tok.line, tok.column);
    this.get(n, tok);
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

// toFixed(2) rounds to 2 digits after the point and gives back a number: 8.2222 -> 8.22
const NUMBER_METHODS = {
  toFixed: { min: 0, max: 1, run: (n, [d = 0], c) => {
    needInt(d, 'toFixed() digits', c);
    if (d < 0 || d > 20) throw c.err('toFixed() digits must be between 0 and 20.');
    return Number(n.toFixed(d));
  } }
};

const BUILTINS = new Set(['input', 'castInt', 'castFloat', 'castString', 'castBool', 'range', 'min', 'max', 'sum', 'len', 'random', 'randint', 'list', 'tuple', 'set', 'dict', 'frozendict', 'frozenset', 'object', 'bin', 'zip', 'enumerate', 'enumarate', 'round', 'id', 'type', 'isinstance', 'issubclass', 'square', 'printf', 'exchange', 'sleep', 'open']);

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
  const objectIds = new WeakMap(), primitiveIds = new Map();

  /* ---- expressions ---- */

  async function ev(e, env) { const v = await evx(e, env); return v === SHORT ? null : v; }

  async function evx(e, env) {
    switch (e.kind) {
      case 'literal': return e.litType === 'template' ? interpolate(e.value, env) : e.value;
      case 'variable': return env.get(e.name, e.token);
      case 'conditional': return truthy(await ev(e.condition, env)) ? ev(e.test, env) : ev(e.otherwise, env);
      case 'list': { const out = []; for (const item of e.items) out.push(await ev(item, env)); return out; }
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
        return readMember(o, e, env);
      }
      case 'update': return update(e, env);
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
        return binaryOp(e.op, a, await ev(e.right, env), e.token);
      }
      case 'call': return call(e, env);
      default: throw new CITError('Invalid expression.');
    }
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

  function readMember(o, e, env) {
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
    if (access && !canAccessField(o, access, env)) throw new CITError(`Cannot access ${access.visibility} field '${e.name}' outside its class.`, tok.line, tok.column);
    if (o.__module && !hasOwn(o, e.name)) throw new CITError(`Module '${o.__module}' has no export '${e.name}'.`, tok.line, tok.column);
    return hasOwn(o, e.name) ? o[e.name] : null;
  }

  // Lists and dictionaries declared with plain `let` (not `let mut`) cannot be changed through that variable.
  function requireMutable(objExpr, env, action, tok) {
    if (objExpr.kind !== 'variable') return;
    const b = env.binding(objExpr.name);
    if (b && READONLY.has(b.value)) throw new CITError(`Cannot ${action} '${objExpr.name}' because it is read-only.`, tok.line, tok.column);
    if (b && b.value && b.value[TUPLE]) throw new CITError(`Cannot ${action} '${objExpr.name}' because tuples are immutable.`, tok.line, tok.column);
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
      if (Array.isArray(obj) && callee.name === 'render' && obj.some(item => item && item.__ui)) {
        if (typeof options.renderUI === 'function') return options.renderUI(obj, obj.__uiTitle || 'CIT App');
        const renderText = value => {
          if (Array.isArray(value)) return value.map(renderText).filter(Boolean).join('\n');
          if (value && value.__ui) return value.children.map(renderText).filter(Boolean).join('\n');
          return value === null || value === undefined ? '' : format(value);
        };
        emit('println', [obj.__uiTitle, renderText(obj)].filter(Boolean).join('\n'));
        return null;
      }
      if (Array.isArray(obj)) return invokeMethod(obj, 'list', 'Lists', LIST_METHODS, e, env);
      if (obj instanceof Map) return invokeMethod(obj, 'dictionary', 'Dictionaries', DICT_METHODS, e, env);
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
        target.set(replacement);
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
    return withDefers(local, async () => {
      const r = await exec(fn.body, local);
      const value = r && r.type === RETURN ? r.value : null;
      if (fn.uiTitle && Array.isArray(value)) Object.defineProperty(value, '__uiTitle', { value: format(await ev(fn.uiTitle, local)) });
      return value;
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

    const tables = [];
    let structFn = null, structEnv = null;
    chain.forEach((c, i) => {
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
        e: Math.E, pi: Math.PI, tau: Math.PI * 2, nan: NaN, inf: Infinity
      };
    }
    if (spec === 'ui') {
      const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'title', 'header', 'p'];
      const ui = { __module: 'ui' };
      for (const tag of tags) ui[tag] = (...children) => ({ __ui: true, tag, children });
      return ui;
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
    if (t.kind === 'variable') return { get: () => env.get(t.name, t.token), set: v => env.set(t.name, v, t.token) };
    if (t.kind === 'member') {
      if (t.optional) throw new CITError("A safe '?.' cannot be used on the left side of an assignment.", t.token.line, t.token.column);
      const o = await ev(t.object, env);
      if (o === null || typeof o !== 'object' || Array.isArray(o) || o instanceof Map) {
        throw new CITError(`Cannot set '${t.name}' on a ${typeOf(o)}.`, t.token.line, t.token.column);
      }
      const currentAccess = FIELD_ACCESS.get(o)?.get(t.name);
      if (currentAccess && !canAccessField(o, currentAccess, env)) {
        throw new CITError(`Cannot access ${currentAccess.visibility} field '${t.name}' outside its class.`, t.token.line, t.token.column);
      }
      return { get: () => (hasOwn(o, t.name) ? o[t.name] : null), set: v => {
        o[t.name] = v;
        let frame = env;
        while (frame && frame.instance !== o) frame = frame.parent;
        let binding = frame && frame.values.get(t.name);
        if (frame && !binding) binding = frame.define(t.name, v, true, typeOf(v), t.token);
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
    const compound = s.op !== '=';
    const rhs = await ev(s.expr, env);
    const target = await resolveTarget(s.target, env, s.visibility);
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
          s.names.forEach((n, i) => {
            const valueIndex = s.broadcast ? 0 : i;
            const v = s.exprs ? values[valueIndex] : null;       // empty variables start as null
            if (v && v.kind === 'function' && !v.name && s.exprs[valueIndex].kind === 'lambda') v.name = n.value;   // let f = x => x  is called "f"
            if (n.value === '_') return;
            const temporal = s.temporal ? {
              unit: s.temporal.unit,
              expiresAt: s.temporal.unit === 's' ? startedAt + s.temporal.amount * 1000 : null,
              expiresLine: s.temporal.unit === 'l' ? n.line + s.temporal.amount : null
            } : null;
            env.define(n.value, v, s.mutable, typeOf(v), n, temporal);
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
          {
            let fn = { kind: 'function', name: s.name, params: s.params, body: s.body, uiTitle: s.uiTitle, closure: env };
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
          const vals = [];
          for (const x of s.args) vals.push(await ev(x, env));
          if (!vals.every(Number.isInteger)) throw new CITError('The values in range(...) must be integers.', s.token.line, s.token.column);
          const [start, end, step] = vals.length === 1 ? [0, vals[0], 1] : vals.length === 2 ? [vals[0], vals[1], 1] : vals;
          if (step === 0) throw new CITError('The step in range(...) cannot be 0.', s.token.line, s.token.column);
          for (let i = start; step > 0 ? i < end : i > end; i += step) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            if (s.name !== '_') loopEnv.define(s.name, i, s.mutable, 'int', s.token);
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
          if (Array.isArray(source) || typeof source === 'string' || source instanceof Set) items = [...source];     // a copy, so the loop is safe if the list changes
          else if (source instanceof Map) items = [...source.keys()];                      // dictionaries loop over their keys
          else throw new CITError(`Cannot loop over a ${typeOf(source)}. Use a list, string or dictionary.`, s.token.line, s.token.column);
          for (const item of items) {
            tick('Loop limit exceeded.');
            const loopEnv = new Env(env);
            if (s.name !== '_') loopEnv.define(s.name, item, s.mutable, typeOf(item), s.token);
            const r = await exec(s.body, loopEnv);
            if (r?.type === BREAK) break;
            if (r?.type === CONTINUE) continue;
            if (r) return r;
          }
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
          env.define(s.alias || defaultAlias(s.path), mod, false, 'module', s.token);
          break;
        }
        case 'importMany': {
          for (const name of s.names) {
            const mod = await loadModule(name, s.token);
            env.define(defaultAlias(name), mod, false, 'module', s.token);
          }
          break;
        }
        case 'break': return { type: BREAK };
        case 'continue': return { type: CONTINUE };
        case 'return': return { type: RETURN, value: s.expr ? await ev(s.expr, env) : null };
      }
    }
    return null;
  }

  await withDefers(global, () => exec(ast, global));
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
