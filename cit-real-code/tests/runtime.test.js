'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { compileBytecode, executeBytecode } = require('../runtime/standalone');
const { formatCit } = require('../runtime/formatter');

async function evaluate(source, input = async () => '') {
  const output = [];
  await executeBytecode(compileBytecode(source), (text, kind) => output.push([text, kind]), input);
  return output;
}

test('parses dictionaries spread across lines and preserves set literals', async () => {
  assert.deepEqual(await evaluate(`let values = {
    first: 1,
    second: 2
}
let names = {"first", "second"}
println(values["first"], values["second"], names)`), [
      ['1 2 {"first", "second"}', 'out']
  ]);
});

test('parses booleans and collections inside println calls before UI selectors', async () => {
  assert.deepEqual(await evaluate('println("a", 1, true, [1, 2], {k: "v"}, null)'), [
    ['a 1 true [1, 2] {k: "v"} null', 'out']
  ]);
});

test('tuples compare only with tuples, including nested collections', async () => {
  assert.deepEqual(await evaluate(`println([1] == (1,), ([1],) == ([1],), [1] == [1])`), [
    ['false true true', 'out']
  ]);
});

test('null coalescing evaluates only the fallback when the left side is null', async () => {
  assert.deepEqual(await evaluate(`let mut calls = 0
fn fallback() { calls += 1; return 7 }
let mut user = null
println(null ?? fallback(), 3 ?? fallback(), user?.name ?? "Guest", calls)`), [
    ['7 3 Guest 1', 'out']
  ]);
});

test('temporal declarations can combine elapsed-time and source-line limits', async () => {
  const source = `let mut new <3s> after <30l> = 12
println(new)`;
  assert.deepEqual(await evaluate(source), [['12', 'out']]);
  assert.doesNotThrow(() => JSON.stringify(compileBytecode(source)));
});

test('functions support variadic positional and named arguments, plus async await', async () => {
  assert.deepEqual(await evaluate(`fn collect(*args, **kwargs) { return [args, kwargs["name"]] }
let collected = collect(1, 2, name: "CIT")
async fn delayed() {
    await task.wait(0)
    return "ready"
}
println(collected[0], collected[1], delayed())`), [
    ['[1, 2] CIT ready', 'out']
  ]);
  await assert.rejects(evaluate('await task.wait(0)'), /only be used inside an async function/);
});

test('reactive variables run watch blocks only after a changed value is assigned', async () => {
  assert.deepEqual(await evaluate(`reactive let mut score = 0
watch score {
    println($"Score changed to: {score}")
}
score = 0
score = 100`), [
    ['Score changed to: 100', 'out']
  ]);
  await assert.rejects(evaluate(`let mut score = 0
watch score { println(score) }`), /must be declared with 'reactive let mut'/);
});

test('classes can overload supported binary operators', async () => {
  assert.deepEqual(await evaluate(`class Vector() {
    fn struct(x, y) { self.x = x; self.y = y }
    operator +(other) { return Vector(self.x + other.x, self.y + other.y) }
}
let result = Vector(2, 3) + Vector(4, 5)
println(result.x, result.y)`), [['6 8', 'out']]);
});

test('generic function declarations and typed call syntax are accepted', async () => {
  assert.deepEqual(await evaluate(`fn identity<T>(value) { return value }
println(identity<int>(10), identity<str>("CIT"))`), [['10 CIT', 'out']]);
});

test('Update 1 syntax survives format and recompilation', () => {
  const source = `fn identity<T>(value){return value}
let fallback = null??"guest"
reactive let mut score=0
watch score{println(score)}
`;
  const formatted = formatCit(source);
  assert.doesNotThrow(() => compileBytecode(formatted));
});

test('UI modules and window prompt/alert are unavailable', async () => {
  await assert.rejects(evaluate('import ui'), /Expected a package or file name/);
  await assert.rejects(evaluate('window.prompt("Name?")'), /Undefined variable 'window'/);
  await assert.rejects(evaluate('window.alert("Hello")'), /Undefined variable 'window'/);
  for (const name of ['exec', 'run', 'kill']) {
    await assert.rejects(evaluate(`import sys\nsys.${name}`), new RegExp(`Module 'sys' has no export '${name}'`));
  }
  await assert.rejects(evaluate('import cli\ncli.password()'), /requires a terminal that supports hidden input/);
});

test('sys.exit stops only the CIT program and returns its requested status', async () => {
  const output = [];
  const result = await executeBytecode(compileBytecode(`import sys
println("before")
sys.exit(7)
println("after")`), (text, kind) => output.push([text, kind]));
  assert.deepEqual(output, [['before', 'out']]);
  assert.equal(result.exitCode, 7);
});

test('hidden password input and VS Code clipboard adapters are used when available', async () => {
  const prompts = [];
  let clipboard = '';
  const result = await executeBytecode(compileBytecode(`import cli
import sys
let password = cli.password("Code:")
let copied = sys.clipRead()
sys.clipWrite(password)
println(copied)`), () => {}, async (prompt, settings) => {
    prompts.push({ prompt, settings });
    return prompt.startsWith('Code:') ? 'secret' : '';
  }, {
    supportsHiddenInput: true,
    clipboard: {
      readText: async () => 'clipboard value',
      writeText: async text => { clipboard = text; }
    }
  });
  assert.deepEqual(prompts, [{ prompt: 'Code: ', settings: { hidden: true } }]);
  assert.equal(result.values.get('password').value, 'secret');
  assert.equal(clipboard, 'secret');
});

test('math statistics validate and calculate collections', async () => {
  assert.deepEqual(await evaluate(`import math
println(math.mean([1, 2, 3]), math.median([1, 2, 8, 9]), math.mode([1, 2, 2, 3]), math.stddev([1, 2, 3]), math.dist([0, 0], [3, 4]))`), [
    ['2 5 2 0.816496580927726 5', 'out']
  ]);
  await assert.rejects(evaluate('import math\nmath.mean([])'), /non-empty list/);
});

test('JSON helpers parse, query, merge and validate text safely', async () => {
  assert.deepEqual(await evaluate(`import json
let parsed = json.parse("{\\"a\\":[1,2],\\"b\\":3}")
let merged = json.merge(parsed, json.parse("{\\"c\\":4}"))
println(json.query(merged, "$.a[1]"), json.validate("{\\"ok\\":true}"), json.minify("{ \\"ok\\" : true }"), json.stringify(merged, indent = 0))`), [
    ['2 true {"ok":true} {"a":[1,2],"b":3,"c":4}', 'out']
  ]);
  await assert.rejects(evaluate('import json\njson.parse("not json")'), /json.parse/);
  const colored = await evaluate('import json\nprintln(json.colorize("{\\"valid\\":true}"))');
  assert.ok(colored[0][0].includes('\x1b[36m"valid"\x1b[0m'));
  assert.ok(colored[0][0].includes('\x1b[35mtrue\x1b[0m'));
});

test('cli module supports terminal selection and tabular output', async () => {
  assert.deepEqual(await evaluate(`import cli
let choice = cli.select(["Start", "Exit"])
cli.table([["Name", "Value"], ["CIT", choice]])
println(choice)`, async () => '2'), [
    ['1) Start', 'out'],
    ['2) Exit', 'out'],
    ['| Name | Value |', 'out'],
    ['| CIT  | 1     |', 'out'],
    ['1', 'out']
  ]);
});

test('datetime and sys expose documented read-only information', async () => {
  assert.deepEqual(await evaluate(`import datetime
import sys
println(datetime.format(0, "%Y-%m-%d"), datetime.diff("1970-01-01", "1970-01-01T00:00:01Z", "ms"))
println(sys.platform(), sys.cwd() != null, sys.pid > 0)`), [
    ['1970-01-01 1000', 'out'],
    [`${process.platform} true true`, 'out']
  ]);
});

test('datetime cron calculation and benchmarking execute callbacks', async () => {
  assert.deepEqual(await evaluate(`import datetime
let next = datetime.cron("* * * * *", "2024-01-01T10:15:00Z")
let measured = datetime.benchmark(() => 2 + 3)
println(datetime.diff("2024-01-01T10:15:00Z", next, "s"), measured.result, measured.durationMs >= 0)`), [
    ['60 5 true', 'out']
  ]);
});

test('database module executes parameterized SQLite queries', async () => {
  const filename = path.join(os.tmpdir(), `cit-${process.pid}-${Date.now()}.sqlite`);
  const literalPath = JSON.stringify(filename);
  try {
    assert.deepEqual(await evaluate(`import database
let mut db = database.connect(${literalPath})
db.run("CREATE TABLE sample (value TEXT)")
db.run("INSERT INTO sample (value) VALUES (?)", ["safe"])
println(db.all("SELECT value FROM sample")[0].value)
db.close()`), [['safe', 'out']]);
  } finally {
    try { fs.unlinkSync(filename); } catch {}
  }
});

test('printf writes formatted text without adding a newline', async () => {
  assert.deepEqual(await evaluate(`printf("Hello %s", "CIT")
println("!")`), [
    ['Hello CIT', 'print'],
    ['!', 'out']
  ]);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cit-runtime-'));
  const file = path.join(directory, 'printf.cit');
  try {
    fs.writeFileSync(file, 'printf("Hello %s", "CIT")', 'utf8');
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'cit.js'), file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Hello CIT');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('math functions reject missing, extra, and non-numeric arguments', async () => {
  assert.deepEqual(await evaluate(`import math
println(math.sqrt(16), math.gcd(12, 18), math.lcm(12, 18))`), [
    ['4 6 36', 'out']
  ]);
  await assert.rejects(evaluate('import math\nmath.sqrt()'), /takes 1 value but got 0/);
  await assert.rejects(evaluate('import math\nmath.sin(1, 2)'), /takes 1 value but got 2/);
  await assert.rejects(evaluate('import math\nmath.gcd(4, 2.5)'), /integers where required/);
});

test('arithmetic does not coerce strings or booleans into numbers', async () => {
  await assert.rejects(evaluate('println("3" - 2)'), /both values must be numbers/);
  await assert.rejects(evaluate('println(true * 2)'), /both values must be numbers/);
  assert.deepEqual(await evaluate('println(7 // 2, 7 % 3, "a" < "b")'), [
    ['3 1 true', 'out']
  ]);
});

test('for placeholders, inheritance, and typed errors remain functional', async () => {
  assert.deepEqual(await evaluate(`class Animal() {
    fn struct(name) { self.name = name }
    fn sound() { return "generic" }
}
class Dog(Animal()) {
    fn struct(name) { super().struct(name) }
    fn sound() { return "woof" }
}
let mut dog = Dog("Rex")
for (let _, range(0, 2)) { println(dog.sound()) }
try { raise ValueError("bad") }
except ValueError as err { println(err) }
finally { println("done") }`), [
    ['woof', 'out'],
    ['woof', 'out'],
    ['bad', 'out'],
    ['done', 'out']
  ]);
});

test('property accessors can update fields from nested control-flow scopes', async () => {
  assert.deepEqual(await evaluate(`class Account() {
    protected let mut balance = 0
    get fn balance() { return self.balance }
    set fn balance(value) {
        if (value >= 0) { self.balance = value }
    }
}
let mut account = Account()
account.balance = 10
println(account.balance)
account.balance = -3
println(account.balance)`), [
    ['10', 'out'],
    ['10', 'out']
  ]);
});

test('temporal modes are restricted to seconds and formatter preserves temporal syntax', async () => {
  await assert.rejects(evaluate('let mut value <2r = offline> = 1'), /only be used with seconds/);
  assert.equal(formatCit('let mut a <5r> = 1\nlet mut b <5s=offline> = 2\nlet mut c <5s = stopUse> = 3'), [
    'let mut a <5r> = 1',
    'let mut b <5s=offline> = 2',
    'let mut c <5s=stopUse> = 3',
    ''
  ].join('\n'));
});
