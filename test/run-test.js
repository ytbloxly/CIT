const fs = require('fs');
const { lint, run, closerFor } = require('../cit-core');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } };
const read = n => fs.readFileSync(`examples/${n}.cit`, 'utf8');
const J = JSON.stringify;

async function exec(src, inputs = ['Alice'], extra = {}) {
  const out = [], sleeps = [];
  const r = await run(src, { write: l => out.push(l), input: async () => inputs.shift(), sleep: ms => { sleeps.push(ms); return new Promise(r => setTimeout(r, 25)); }, ...extra });
  return { out, sleeps, ...r };
}
const main = body => `void main()\n${body}\nend;\nreturn error.NoErr;`;

(async () => {
  const expect = {
    hello: ['Hello World!'],
    variables: ['My value is True!', 'My string is String'],
    math: ['toMath value is 0'],
    if: ['x value is 5'],
    for: Array.from({ length: 12 }, (_, i) => String(i)),
    input: ['Your name is Alice'],
    casting: ['True'],
    errors: [],
    functions: ['6'],
    classes: ['Jake is 21 years old!', 'I am talking'],
    inheritance: ['Jake is 21 years old!', 'I am talking', 'Works at Brickworks'],
    'inheritance-super': ['I am talking', 'I build for ACME', 'Bob is 30'],
    while: ['clicks = 1', 'clicks = 2', 'clicks = 3', 'clicks = 4', 'clicks = 5'],
    polymorphism: ['I am talking', 'I build for ACME', 'Bob is 30',
      'I am talking', 'I build for ACME', 'Null', 'I am talking', 'Null'],
    arrays: ['[1, True, Null, "Hi!"]', '3', '4'],
    tasks: ['Hello World!', 'Hello World!'],
    'tasks-repeat': ['tick', 'tick', 'tick'],
    control: ['0', '1', '3', '4', '42', 'Null', 'positive'],
    when: ['My grade is A'],
    step: ['3', '1'],
    dictionary: ['{name: Bob, age: 32, address: 32 John Street}', '32', '["name", "age", "address", "job"]'],
    enum: ['North', 'Directions.0'],
    'array-methods': ['[1, True, Null, "Hi!", "!!"]']
  };
  for (const [name, want] of Object.entries(expect)) {
    const src = read(name);
    const errs = lint(src);
    ok(errs.length === 0, `${name}: lint ${J(errs.map(e => e.message))}`);
    const r = await exec(src);
    ok(J(r.out) === J(want), `${name}: output ${J(r.out)}`);
    ok(r.exit === 'NoErr' && !r.error, `${name}: exit ${r.exit} ${J(r.error)}`);
    console.log(`${name.padEnd(18)}->`, J(r.out.length > 3 ? [...r.out.slice(0, 3), '...'] : r.out), 'error.' + r.exit);
  }
  ok((await exec(read('while'))).sleeps.length === 5, 'task.wait called 5 times');

  // ---- tuples
  let r = await exec(read('tuples'));
  ok(lint(read('tuples')).length === 0, 'tuples lint clean');
  ok(r.error && /Tuples cannot be changed/.test(r.error.message) && r.error.line === 3 && r.out.length === 0, 'tuple assignment error ' + J(r.error));
  r = await exec(main(' default list t = (1, True, Null, "Hi!");\n console.write(t);\n console.write((1,));\n console.write(());\n console.write(t[1]);\n console.write(t[-1]);\n console.write(t.length);'));
  ok(J(r.out) === J(['(1, True, Null, "Hi!")', '(1,)', '()', 'True', 'Hi!', '4']), 'tuple printing/indexing ' + J(r));
  r = await exec(main(' default list t = (1, 2);\n t.push(3);'));
  ok(r.error && /Tuples cannot be changed/.test(r.error.message), 'tuple push error');
  r = await exec(main(' default num x = (1 + 2) * 3;\n console.write(x);'));
  ok(r.out[0] === '9', 'grouping still works');

  // ---- list methods in detail
  r = await exec(main(' default list a = [1, 2, 3];\n console.write(a.pop());\n console.write(a.shift());\n default list gone = a.splice(0, 1, "x", "y");\n console.write(a);\n console.write(gone);\n a.splice(-1, 1);\n console.write(a);\n console.write([1, [2, 3]] == [1, [2, 3]]);'));
  ok(J(r.out) === J(['3', '1', '["x", "y"]', '[2]', '["x"]', 'True']), 'list methods ' + J(r.out) + J(r.error));
  r = await exec(main(' default list a = [1];\n console.write(a[5]);'));
  ok(r.error && /out of range/.test(r.error.message), 'index out of range');
  r = await exec(main(' default list a = [];\n a.pop();'));
  ok(r.error && /empty list/.test(r.error.message), 'pop empty');
  r = await exec(main(' default list a = [1, 2];\n a[1] += 5;\n a[0] = a[1];\n console.write(a);'));
  ok(r.out[0] === '[7, 7]', 'index compound assign ' + J(r));
  r = await exec(main(' default list a = [1, True, Null];\n default string s = parseString(a);\n console.write(s);\n console.write(Null == Null);'));
  ok(J(r.out) === J(['[1, True, Null]', 'True']), 'parseString list / Null');

  // ---- polymorphism extras
  const orig = read('polymorphism').replace('info(b);', 'info(b());');
  r = await exec(orig);
  ok(r.error && /not a function/.test(r.error.message), 'info(b()) gives a helpful error: ' + J(r.error));

  // ---- logic operators: only && || !  (and / or / not were removed)
  r = await exec(main(' default num a = 3;\n if (!(a > 5) && (a == 3 || False)) do\n console.write("symbols");\n end;'));
  ok(J(r.out) === '["symbols"]', 'symbols work ' + J(r));
  r = await exec(main(' if (True and False) do\n end;'));
  ok(r.error && r.error.message === "Use '&&' instead of 'and'.", 'and removed: ' + J(r.error));
  r = await exec(main(' if (True or False) do\n end;'));
  ok(r.error && r.error.message === "Use '||' instead of 'or'.", 'or removed');
  r = await exec(main(' if (not True) do\n end;'));
  ok(r.error && r.error.message === "Use '!' instead of 'not'.", 'not removed');
  r = await exec(main(' default num and = 2;\n console.write(and);'));
  ok(r.out[0] === '2', 'and is a free identifier now');


  // ---- tasks in detail
  r = await exec('void main()\n task.start(t()) until task.repeated(3);\nend;\ntask t() do\n console.write("x");\n task.wait(1);\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["x","x","x"]', 'start until repeated(3) ' + J(r.out));
  r = await exec('void main()\n task.start(t());\n task.wait(0.07);\n task.stop(t());\nend;\ntask t() do\n console.write("x");\n task.wait(0.03);\nend;\nreturn error.NoErr;');
  ok(r.out.length >= 2 && r.out.length <= 4 && r.exit === 'NoErr', 'unlimited task until stop ' + J(r.out));
  r = await exec('void main()\n task.repeat(t("A", 2), 2);\n task.repeat(t("B", 1), 1);\nend;\ntask t(label, n) do\n console.write(label);\n task.wait(0.01);\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["A","B","A"]', 'task params + interleaving ' + J(r.out));
  r = await exec('void main()\n task.repeat(t(), 5);\nend;\ntask t() do\n console.write("a");\n break;\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["a"]', 'break stops a task');
  r = await exec('void main()\n task.repeat(t(), 3);\nend;\ntask t() do\n continue;\n console.write("never");\nend;\nreturn error.NoErr;');
  ok(r.out.length === 0 && r.exit === 'NoErr', 'continue in task');
  r = await exec('void main()\n t();\nend;\ntask t() do\nend;\nreturn error.NoErr;');
  ok(r.error && /is a task/.test(r.error.message), 'calling a task directly: ' + J(r.error));
  r = await exec('void main()\n task.start(nope());\nend;\nreturn error.NoErr;');
  ok(r.error && /Unknown task/.test(r.error.message), 'unknown task');
  r = await exec('void main()\n task.repeat(t(), 1);\nend;\ntask t() do\n raise error.ValueError;\nend;\nreturn error.NoErr;');
  ok(r.exit === 'ValueError' && r.error && /was raised/.test(r.error.message), 'raise inside a task ' + J(r));
  r = await exec('void main()\n task.repeat(t(), 1);\nend;\ntask t() do\n default num x = 1 / 0;\nend;\nreturn error.NoErr;');
  ok(r.exit === 'ErrUnknown' && /Division/.test(r.error.message), 'error inside a task');
  ok(lint(read('tasks')).length === 0 && lint(read('tasks-repeat')).length === 0, 'task examples lint clean');
  ok(lint('void main()\n task t() do\n end;\nend;\nreturn error.NoErr;').some(p => p.message.includes('Tasks must be declared at the top level')), 'task inside main');

  // ---- break / continue / return / pass
  ok(lint(main(' break;')).some(p => p.message.includes('can only be used inside')), 'break outside loop');
  ok(lint(main(' while (True) do\n func f() do\n break;\n end;\n end;')).some(p => p.message.includes('can only be used inside')), 'break does not cross func');
  ok(lint(main(' return 5;')).some(p => p.message.includes('inside a `func`')), 'return value outside func');
  ok(lint(main(' return;')).some(p => p.message.includes('inside a `func`')), 'bare return outside func');
  ok(lint(main(' while (True) do\n if (True) do\n break;\n end;\n end;')).length === 0, 'break inside if inside loop ok');
  r = await exec(main(' default num n = 0;\n while (True) do\n n++;\n if (n > 3) do\n break;\n end;\n end;\n console.write(n);'));
  ok(r.out[0] === '4', 'while + break');
  r = await exec(main(' func fact(n) do\n if (n <= 1) do\n return 1;\n end;\n return n * fact(n - 1);\n end;\n console.write(fact(5));'));
  ok(r.out[0] === '120', 'recursion with return value ' + J(r));
  r = await exec(main(' default num x = 0;\n (x == 0) >> pass;'));
  ok(lint(main(' default num x = 0;\n when (x) do\n (x == 0) >> pass;\n end;')).length === 0, 'pass as a case');

  // ---- when
  r = await exec(main(' default string c = "red";\n when (c) do\n ("blue") >> console.write("B");\n ("red") >> console.write("R");\n else >> console.write("?");\n end;'));
  ok(r.out[0] === 'R' && r.out.length === 1, 'when compares non-bool cases with the subject ' + J(r));
  r = await exec(main(' default num n = 7;\n when (n) do\n (n > 1) >> console.write("a");\n (n > 2) >> console.write("b");\n else >> console.write("c");\n end;'));
  ok(J(r.out) === '["a"]', 'when: first match wins');
  r = await exec(main(' default num n = 0;\n when (n) do\n (n > 1) >> console.write("a");\n else >> console.write("c");\n end;'));
  ok(J(r.out) === '["c"]', 'when else');
  ok(lint(main(' (1 == 1) >> pass;')).some(p => p.message.includes('belong inside a `when')), 'case outside when');
  ok(lint(read('when')).length === 0, 'when example lint clean');

  // ---- ++ / --
  r = await exec(main(' default list a = [1, 2];\n a[0]++;\n --a[1];\n default list d = {n: 1};\n d.n++;\n console.write(a);\n console.write(d.n);'));
  ok(J(r.out) === '["[2, 1]","2"]', '++ on index and key ' + J(r));
  r = await exec(main(' default string s = "x";\n s++;'));
  ok(r.error && /needs a num/.test(r.error.message), '++ needs a num');
  ok(lint(main(' default num i = 1;\n i++')).some(p => p.message.startsWith('Missing semicolon')), '++ needs semicolon');

  // ---- dictionaries
  r = await exec(main(' default list d = {"first name": "Al", age: 3,};\n console.write(d);\n console.write(d["first name"]);\n console.write(d.has("age"));\n console.write(d.remove("age"));\n console.write(d.length);\n console.write(d.values());\n console.write({} == {});'));
  ok(J(r.out) === J(['{first name: Al, age: 3}', 'Al', 'True', '3', '1', '["Al"]', 'True']), 'dictionary ops ' + J(r.out) + J(r.error));
  r = await exec(main(' default list d = {a: 1};\n console.write(d["zzz"]);'));
  ok(r.error && /not found/.test(r.error.message), 'missing key');
  r = await exec(main(' default list d = {name: "Bob"};\n default num x = 1;\n console.write(d.name);\n console.write(x.name);'));
  ok(J(r.out) === '["Bob","x"]', 'dict key beats .name, variables keep .name');

  // ---- enums
  r = await exec(main(' default enum Color do\n Color.Red;\n Color.Green;\n end;\n default enum c = Color.Green;\n console.write(c == Color.Green);\n console.write(c == Color.Red);\n console.write(Color.length);\n console.write(Color["Red"]);\n console.write(c.name);\n when (c) do\n (Color.Green) >> console.write("green!");\n end;'));
  ok(J(r.out) === J(['True', 'False', '2', 'Color.0', 'Green', 'green!']), 'enum values ' + J(r.out) + J(r.error));
  ok(lint(read('enum')).length === 0, 'enum example lint clean');
  ok(lint(main(' default enum E do\n E.A;\n E.A;\n end;')).some(p => p.message.includes('Duplicate enum member')), 'duplicate member');
  ok(lint(main(' default enum E do\n F.A;\n end;')).some(p => p.message.includes('E.Member')), 'wrong enum prefix');
  ok(lint(main(' default enum E do\n default num x = 1;\n E.A;\n end;')).some(p => p.message.includes('belong inside an enum')), 'statement in enum');
  r = await exec(main(' default enum E do\n E.A;\n end;\n E[5];'));
  ok(r.error, 'enum index out of range / bad statement');

  // ---- raise
  r = await exec(read('raise'));
  ok(lint(read('raise')).length === 0, 'raise lint clean');
  ok(r.exit === 'ValueError' && r.error && /error.ValueError was raised/.test(r.error.message) && J(r.out) === '["Age can\'t be under 1!"]', 'raise runs block then errors ' + J(r));
  r = await exec(main(' raise error.Custom;'));
  ok(r.exit === 'Custom' && r.error.line === 1, 'bare raise, custom name');
  ok(lint(main(' raise error.X do\n console.write("a");')).some(p => p.message.includes('never closed')), 'raise needs end;');

  // ---- UI
  ok(lint(read('ui')).length === 0, 'ui lint clean');
  let ui, fire;
  const out = [], updates = [], outputs = [];
  r = await run(read('ui'), {
    write: l => out.push(l), input: async () => '',
    uiReady: (u, f) => { ui = u; fire = f; },
    uiUpdate: (n, t) => updates.push([n, t]),
    uiOutput: (n, t) => outputs.push([n, t])
  });
  ok(r.exit === 'NoErr' && ui && ui.title === 'Button Clicker' && ui.elements.length === 3, 'ui created');
  ok(ui.elements[0].attrs.id === 'Click' && ui.elements[0].attrs.class === 'clicking' && ui.elements[0].kind === 'button', 'ui attrs');
  ok(ui.elements[2].kind === 'codeOutput' && ui.elements[2].text === 'Output', 'codeOutput placeholder');
  await fire('my_button'); await fire('my_button');
  ok(J(out) === J(['You have clicked the button!', 'You have clicked the button!']), 'click handler output ' + J(out));
  ok(J(updates) === J([['paragraph', 'Clicked 1 time(s)!'], ['paragraph', 'Clicked 2 time(s)!']]), 'paragraph updates ' + J(updates));
  ok(J(outputs) === J([['output', 'You have clicked the button!'], ['output', 'You have clicked the button!']]), 'codeOutput receives console output ' + J(outputs));
  ok(ui.elements[2].log.length === 2, 'codeOutput log');
  const res = await fire.close();
  ok(!res.error && out[2] === 'You clicked 2 time(s)', 'closed handler ' + J(out));
  await fire.close();
  ok(out.length === 3, 'closed fires only once');
  // writes before the click also land in codeOutput
  r = await run('import ui;\nui.root r(title="T")\n ui o -> ui.codeOutput() = "Placeholder";\nend;\nvoid main()\n console.write("hi");\nend;\nreturn error.NoErr;', { write() {}, input: async () => '', uiReady: (u) => { ui = u; } });
  ok(ui.elements[0].log[0] === 'hi' && ui.elements[0].text === 'Placeholder', 'codeOutput gets main output');

  // ---- cancellation (Ctrl+C)
  let n = 0;
  r = await exec('void main()\n while (True) do\n end;\nend;\nreturn error.NoErr;', [], { isCancelled: () => ++n > 50 });
  ok(r.exit === 'NoErr' && !r.error, 'cancel stops infinite loop');

  // ---- lint
  const cls = read('classes').replace('years old!");', 'years old!")');
  ok(lint(cls).some(p => p.message.startsWith('Missing semicolon')), 'classes: missing ; flagged');
  const bm = lint(read('broken')).map(p => p.message);
  ok(bm.some(m => m.startsWith('Missing semicolon')), 'broken: semicolon');
  ok(bm.some(m => m.includes('Close this callback with `end);`')), 'broken: end; on callback');
  ok(bm.some(m => m.includes('Unknown parent class `Nobody`')), 'broken: parent');
  ok(lint(main(' class A() do\n end;')).some(p => p.message.includes('top level')), 'class inside main');
  ok(lint(main(' if (True) do\n end);')).some(p => p.message.includes('only closes')), 'end); on if');
  ok(lint('class A() do\nend;\nreturn error.NoErr;').some(p => p.message.includes('needs a `void main()`')), 'needs main');
  ok(lint('ui my_b -> ui.button() = "x";\nvoid main()\nend;\nreturn error.NoErr;').some(p => p.message.includes('inside `ui.root`')), 'ui elem outside root');
  ok(lint('import ui;\nui.root r()\n ui o -> ui.nope() = "x";\nend;\nvoid main()\nend;\nreturn error.NoErr;').some(p => p.message.includes('Unknown UI element')), 'unknown ui element');
  ok(lint('void main()\n else do\nend;\nreturn error.NoErr;').some(p => p.message.includes('without a matching')), 'else without if');
  ok(lint('return error.Nope;').some(p => p.severity === 'warning'), 'unknown error warning');

  // ---- earlier runtime checks
  r = await exec(main(' default classIns p = Nope(1);'));
  ok(r.error && /Unknown function/.test(r.error.message), 'unknown class');
  r = await exec('void main()\n default classIns p = Person(1);\nend;\nclass Person() do\nend;\nreturn error.NoErr;');
  ok(r.error && /expects 0 argument/.test(r.error.message), 'ctor arity');
  r = await exec('void main()\n default classIns p = Person();\n p.fly();\nend;\nclass Person() do\nend;\nreturn error.NoErr;');
  ok(r.error && /no method 'fly'/.test(r.error.message), 'missing method');
  r = await exec(main(' default num x = 1;\n x /= 0;'));
  ok(r.exit === 'ErrUnknown' && /Division/.test(r.error.message), 'div by zero');
  r = await exec('void main()\n return error.Err;\n console.write("never");\nend;\nreturn error.NoErr;');
  ok(r.exit === 'Err' && r.out.length === 0, 'early return');
  r = await exec('void main()\n while (True) do\n end;\nend;\nreturn error.NoErr;');
  ok(r.error && /Loop limit/.test(r.error.message), 'infinite loop guard');
  r = await exec('void main()\n default num x = 5;\n console.write(x.name);\n default classIns p = P("Zed");\n console.write(p.name);\nend;\nclass P() do\n func _init(n) do\n this.name = n;\n end;\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["x","Zed"]', '.name rules ' + J(r));

  // ---- auto-close
  ok(closerFor('void main()\n    \n', 0) === 'end;', 'closer main');
  ok(closerFor('class A() do\n    \n', 0) === 'end;', 'closer class');
  ok(closerFor('ui.root main(title="x")\n    \n', 0) === 'end;', 'closer ui.root');
  ok(closerFor('void main()\n    main.closed(func closing()\n        \n', 1) === 'end);', 'closer funcarg');
  ok(closerFor('void main()\n    if (x == 1) do\n        \n    end;\nend;', 1) === null, 'no double end');
  ok(closerFor('void main()\n    if (x == 1) do\n    else do\n', 2) === null, 'else does not open');

  console.log(fails ? `\n${fails} FAILED` : '\nAll tests passed');
  process.exit(fails ? 1 : 0);
})();
