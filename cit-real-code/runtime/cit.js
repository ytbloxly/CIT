'use strict';

class CITError extends Error {
  constructor(message, line = 1, column = 1) {
    super(message);
    this.name = 'CITError';
    this.line = line;
    this.column = column;
  }
}

function tokenize(source) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  };
  const push = (type, value, startLine = line, startCol = col) =>
    tokens.push({ type, value, line: startLine, column: startCol });

  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue; }
    if (ch === '\n') { advance(); continue; }
    if (ch === '#' ) {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line, startCol = col;
      advance(); advance();
      let closed = false;
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          advance(); advance(); closed = true; break;
        }
        advance();
      }
      if (!closed) throw new CITError('Unterminated block comment.', startLine, startCol);
      continue;
    }
    const startLine = line, startCol = col;
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let value = '', closed = false;
      while (i < source.length) {
        const c = advance();
        if (c === '\\') {
          if (i >= source.length) break;
          const escaped = advance();
          const map = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          value += Object.prototype.hasOwnProperty.call(map, escaped) ? map[escaped] : escaped;
        } else if (c === quote) {
          closed = true; break;
        } else {
          if (c === '\n') throw new CITError('Unterminated string or character literal.', startLine, startCol);
          value += c;
        }
      }
      if (!closed) throw new CITError('Unterminated string or character literal.', startLine, startCol);
      if (quote === "'" && [...value].length !== 1) {
        throw new CITError('A char literal must contain exactly one character.', startLine, startCol);
      }
      push(quote === '"' ? 'string' : 'char', value, startLine, startCol);
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let value = '';
      while (i < source.length && /[0-9]/.test(source[i])) value += advance();
      if (source[i] === '.' && /[0-9]/.test(source[i + 1] || '')) {
        value += advance();
        while (i < source.length && /[0-9]/.test(source[i])) value += advance();
        push('float', Number(value), startLine, startCol);
      } else {
        push('int', Number(value), startLine, startCol);
      }
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let value = '';
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) value += advance();
      push('identifier', value, startLine, startCol);
      continue;
    }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '**', '//'].includes(two)) {
      advance(); advance(); push('operator', two, startLine, startCol); continue;
    }
    if ('+-*/%<>=!'.includes(ch)) {
      advance(); push('operator', ch, startLine, startCol); continue;
    }
    if ('(){};,'.includes(ch)) {
      advance(); push('punctuation', ch, startLine, startCol); continue;
    }
    throw new CITError(`Unexpected character '${ch}'.`, startLine, startCol);
  }
  tokens.push({ type: 'eof', value: '', line, column: col });
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  current() { return this.tokens[this.pos]; }
  previous() { return this.tokens[this.pos - 1]; }
  check(value) { return this.current().value === value; }
  match(...values) {
    if (values.includes(this.current().value)) { this.pos++; return true; }
    return false;
  }
  consume(value, message) {
    if (this.check(value)) return this.tokens[this.pos++];
    const t = this.current();
    throw new CITError(message || `Expected '${value}', found '${t.value || 'end of file'}'.`, t.line, t.column);
  }
  expectType(type, message) {
    if (this.current().type === type) return this.tokens[this.pos++];
    const t = this.current();
    throw new CITError(message || `Expected ${type}, found '${t.value}'.`, t.line, t.column);
  }
  parse() {
    const statements = [];
    while (this.current().type !== 'eof') statements.push(this.statement());
    return statements;
  }
  statement() {
    if (this.match(';')) return { kind: 'empty' };
    if (this.match('let')) {
      const mutable = this.match('mut');
      const name = this.expectType('identifier', 'Expected a variable name after let.');
      this.consume('=', "Expected '=' in variable declaration.");
      return { kind: 'declare', name: name.value, mutable, expr: this.expression(), line: name.line, column: name.column };
    }
    if (['int', 'float', 'str', 'char', 'bool'].includes(this.current().value)) {
      const type = this.current().value; this.pos++;
      const name = this.expectType('identifier', `Expected a variable name after ${type}.`);
      this.consume('=', "Expected '=' in typed variable declaration.");
      return { kind: 'declareTyped', name: name.value, declaredType: type, expr: this.expression(), line: name.line, column: name.column };
    }
    if (this.match('if')) {
      this.consume('(', "Expected '(' after if.");
      const condition = this.expression();
      this.consume(')', "Expected ')' after if condition.");
      const thenBranch = this.block();
      let elseIf = [];
      while (this.match('elseif')) {
        this.consume('(', "Expected '(' after elseif.");
        const c = this.expression();
        this.consume(')', "Expected ')' after elseif condition.");
        elseIf.push({ condition: c, body: this.block() });
      }
      let elseBranch = null;
      if (this.match('else')) elseBranch = this.block();
      return { kind: 'if', condition, thenBranch, elseIf, elseBranch };
    }
    if (this.match('{')) {
      this.pos--;
      return { kind: 'block', body: this.block() };
    }
    if (this.current().type === 'identifier' && this.current().value === 'println') {
      this.pos++;
      this.consume('(', "Expected '(' after println.");
      const args = [];
      if (!this.check(')')) {
        do { args.push(this.expression()); } while (this.match(','));
      }
      this.consume(')', "Expected ')' after println arguments.");
      return { kind: 'print', args };
    }
    if (this.current().type === 'identifier') {
      const name = this.current();
      if (this.tokens[this.pos + 1]?.value === '=') {
        this.pos += 2;
        return { kind: 'assign', name: name.value, expr: this.expression(), line: name.line, column: name.column };
      }
    }
    const t = this.current();
    throw new CITError(`Unexpected token '${t.value}'. Expected a declaration, println(), if, or assignment.`, t.line, t.column);
  }
  block() {
    this.consume('{', "Expected '{' to begin block.");
    const body = [];
    while (!this.check('}') && this.current().type !== 'eof') body.push(this.statement());
    this.consume('}', "Expected '}' to close block.");
    return body;
  }
  expression() { return this.binary(0); }
  binary(minPrec) {
    let left;
    if (this.match('!')) left = { kind: 'unary', op: '!', expr: this.binary(7) };
    else if (this.match('-')) left = { kind: 'unary', op: '-', expr: this.binary(7) };
    else if (this.match('+')) left = { kind: 'unary', op: '+', expr: this.binary(7) };
    else left = this.primary();
    const precedence = {
      '||': 1, or: 1, '&&': 2, and: 2,
      '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
      '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '**': 7
    };
    while (true) {
      const op = this.current().value;
      const p = precedence[op];
      if (p === undefined || p < minPrec) break;
      this.pos++;
      const right = this.binary(p + (op === '**' ? 0 : 1));
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  primary() {
    const t = this.current();
    if (this.match('true')) return { kind: 'literal', value: true, type: 'bool' };
    if (this.match('false')) return { kind: 'literal', value: false, type: 'bool' };
    if (this.match('null')) return { kind: 'literal', value: null, type: 'null' };
    if (t.type === 'int' || t.type === 'float' || t.type === 'string' || t.type === 'char') {
      this.pos++;
      const type = t.type === 'string' ? 'str' : t.type;
      return { kind: 'literal', value: t.value, type };
    }
    if (this.match('(')) {
      const expr = this.expression();
      this.consume(')', "Expected ')' after expression.");
      return expr;
    }
    if (t.type === 'identifier') {
      this.pos++;
      return { kind: 'variable', name: t.value, line: t.line, column: t.column };
    }
    throw new CITError(`Expected an expression, found '${t.value || 'end of file'}'.`, t.line, t.column);
  }
}

function typeOf(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'string') return 'str';
  return 'unknown';
}

function castOrCheck(value, type, token) {
  if (value === null) {
    if (type === 'null') return value;
    throw new CITError(`Cannot assign null to ${type}.`, token.line, token.column);
  }
  const actual = typeOf(value);
  if (type === actual) return value;
  if (type === 'float' && actual === 'int') return value;
  throw new CITError(`Type mismatch: expected ${type}, received ${actual}.`, token.line, token.column);
}

function evaluate(expr, env) {
  if (expr.kind === 'literal') return expr.value;
  if (expr.kind === 'variable') {
    if (!env.has(expr.name)) throw new CITError(`Undefined variable '${expr.name}'.`, expr.line, expr.column);
    return env.get(expr.name).value;
  }
  if (expr.kind === 'unary') {
    const value = evaluate(expr.expr, env);
    if (expr.op === '!') return !truthy(value);
    if (typeof value !== 'number') throw new CITError(`Unary '${expr.op}' requires a number.`, 1, 1);
    return expr.op === '-' ? -value : value;
  }
  if (expr.kind === 'binary') {
    const left = evaluate(expr.left, env);
    if (expr.op === '&&' || expr.op === 'and') return truthy(left) && truthy(evaluate(expr.right, env));
    if (expr.op === '||' || expr.op === 'or') return truthy(left) || truthy(evaluate(expr.right, env));
    const right = evaluate(expr.right, env);
    switch (expr.op) {
      case '+':
        if (typeof left === 'string' && typeof right === 'string') return left + right;
        if (typeof left === 'number' && typeof right === 'number') return left + right;
        throw new CITError("Operator '+' requires two numbers or two strings.");
      case '-': case '*': case '/': case '//': case '%': case '**':
        if (typeof left !== 'number' || typeof right !== 'number') throw new CITError(`Operator '${expr.op}' requires numbers.`);
        if ((expr.op === '/' || expr.op === '//' || expr.op === '%') && right === 0) throw new CITError('Division by zero.');
        if (expr.op === '-') return left - right;
        if (expr.op === '*') return left * right;
        if (expr.op === '/') return left / right;
        if (expr.op === '//') return Math.floor(left / right);
        if (expr.op === '%') return ((left % right) + right) % right;
        return left ** right;
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': case '>': case '<=': case '>=':
        if (typeof left !== typeof right || !['number', 'string'].includes(typeof left)) {
          throw new CITError(`Operator '${expr.op}' requires two numbers or two strings of the same type.`);
        }
        if (expr.op === '<') return left < right;
        if (expr.op === '>') return left > right;
        if (expr.op === '<=') return left <= right;
        return left >= right;
    }
  }
  throw new CITError('Unknown expression.');
}
function truthy(v) { return v !== false && v !== null && v !== 0 && v !== ''; }

function run(source, output = () => {}) {
  const tokens = tokenize(source);
  const ast = new Parser(tokens).parse();
  const env = new Map();
  function execStatements(statements) {
    for (const stmt of statements) execStatement(stmt);
  }
  function execStatement(stmt) {
    switch (stmt.kind) {
      case 'empty': return;
      case 'block': return execStatements(stmt.body);
      case 'declare': {
        if (env.has(stmt.name)) throw new CITError(`Variable '${stmt.name}' is already declared.`, stmt.line, stmt.column);
        const value = evaluate(stmt.expr, env);
        const type = typeOf(value);
        if (type === 'unknown') throw new CITError(`Cannot infer type of '${stmt.name}'.`, stmt.line, stmt.column);
        env.set(stmt.name, { value, type, mutable: stmt.mutable });
        return;
      }
      case 'declareTyped': {
        if (env.has(stmt.name)) throw new CITError(`Variable '${stmt.name}' is already declared.`, stmt.line, stmt.column);
        const value = evaluate(stmt.expr, env);
        const valueChecked = castOrCheck(value, stmt.declaredType, { line: stmt.line, column: stmt.column });
        env.set(stmt.name, { value: valueChecked, type: stmt.declaredType, mutable: false });
        return;
      }
      case 'assign': {
        if (!env.has(stmt.name)) throw new CITError(`Undefined variable '${stmt.name}'.`, stmt.line, stmt.column);
        const variable = env.get(stmt.name);
        if (!variable.mutable) throw new CITError(`Cannot reassign immutable variable '${stmt.name}'. Use 'let mut' to make it mutable.`, stmt.line, stmt.column);
        const value = evaluate(stmt.expr, env);
        const checked = castOrCheck(value, variable.type, { line: stmt.line, column: stmt.column });
        variable.value = checked;
        return;
      }
      case 'print': output(stmt.args.map(arg => String(evaluate(arg, env))).join(' ')); return;
      case 'if':
        if (truthy(evaluate(stmt.condition, env))) return execStatements(stmt.thenBranch);
        for (const branch of stmt.elseIf) if (truthy(evaluate(branch.condition, env))) return execStatements(branch.body);
        if (stmt.elseBranch) return execStatements(stmt.elseBranch);
        return;
      default: throw new CITError(`Unsupported statement '${stmt.kind}'.`);
    }
  }
  execStatements(ast);
}

module.exports = { run, tokenize, Parser, CITError };
