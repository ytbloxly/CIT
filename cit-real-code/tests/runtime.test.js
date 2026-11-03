'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { compileBytecode, executeBytecode } = require('../runtime/standalone');

async function evaluate(source) {
  const output = [];
  await executeBytecode(compileBytecode(source), (text, kind) => output.push([text, kind]));
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

test('tuples compare only with tuples, including nested collections', async () => {
  assert.deepEqual(await evaluate(`println([1] == (1,), ([1],) == ([1],), [1] == [1])`), [
    ['false true true', 'out']
  ]);
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

test('CLI UI fallback renders the title and element text instead of object placeholders', async () => {
  assert.deepEqual(await evaluate(`import ui
fn app(ui.title = "My App") {
    return [ui.h1("Hello"), ui.p("Paragraph")]
}
app().render()`), [
    ['My App\nHello\nParagraph', 'out']
  ]);
});
