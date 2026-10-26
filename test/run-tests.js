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
    defaults: ['3', '4', 'Hello, Ann!', 'Hi, Bob!'],
    'ui-style': ['styled!'],
    'ui-input': ['Type something in the inputs'],
    'ui-events': [],
    switch: ['Your name is bloxl'],
    'ui-states': [],
    'ui-style-tags': ['all style tags'],
    'when-is': ['My grade is A'],
    math: ['3.141592653589793', '5', '4', '-4', '4', '3', '1024', '3', '3', '180', '120', '6', '3.5'],
    sets: ['{1, 2, 3, 4, 5}', 'True', '{2, 4, 5, 6}', 'set()', '{1, 4, 5, 2, 3}', '{1, 4, 2}', '{5}', '{5, 3}'],
    optional: ['Null', '5', 'now a string'],
    builtins: ['num', 'list', 'tuple', 'set', 'dict', '5', '["a", "b", "c"]', '{1, 2, 3}', '(1, 2)', '9', '3',
      'Builder', 'True', 'True', 'True', 'True', 'False'],
    strings: ['BSHHAIILK', 'bshhaiilk', 'sbhhaiilk', 'True', 'True', 'False', 'haiilk', 'haiilk'],
    try: ['1. Trying to run code...', '3. Runs ALWAYS, no matter what.'],
    'try-catch': ['1. Trying...', '2. Caught ErrUnknown: Division by zero.', '3. Always runs', 'raising...', 'caught ValueError'],
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


  // ---- default parameter values
  r = await exec(main(' func f(a, b = a * 2, c = 10) do\n return a + b + c;\n end;\n console.write(f(1));\n console.write(f(1, 1));\n console.write(f(1, b, 0));\n console.write(f(1, 1, c));'));
  ok(J(r.out) === J(['13', '12', '3', '12']), 'defaults can use earlier params; skip with the param name ' + J(r.out) + J(r.error));
  r = await exec(main(' func f(a = 1, b) do\n return a + b;\n end;\n console.write(f(a));'));
  ok(r.error && /missing a value for 'b'/.test(r.error.message), 'missing required param ' + J(r.error));
  r = await exec(main(' func f(a, b = 2) do\n return a;\n end;\n console.write(f(1, 2, 3));'));
  ok(r.error && /expects 2 argument/.test(r.error.message), 'too many args');
  r = await exec(main(' func f(a, b = 2) do\n return a;\n end;\n console.write(f(b));'));
  ok(r.error && /Unknown variable 'b'|missing a value/.test(r.error.message), 'only params WITH a default can be skipped by name: ' + J(r.error));
  r = await exec(main(' func f(items = [1, 2], n = max(1, 2)) do\n console.write(items);\n end;\n f();').replace('max(1, 2)', '3'));
  ok(r.out[0] === '[1, 2]', 'default value with commas inside [ ]');
  r = await exec('void main()\n default classIns p = P();\n p.hi();\n p.hi("Yo");\nend;\nclass P() do\n func _init(x = 5) do\n this.x = x;\n end;\n func hi(w = "Hello") do\n console.write(f"{w} {this.x}");\n end;\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["Hello 5","Yo 5"]', 'defaults in classes ' + J(r));
  r = await exec('void main()\n task.repeat(t(), 2);\nend;\ntask t(label = "tick") do\n console.write(label);\n task.wait(0.01);\nend;\nreturn error.NoErr;');
  ok(J(r.out) === '["tick","tick"]', 'defaults in tasks ' + J(r.out));

  // ---- ui.style
  ok(lint(read('ui-style')).length === 0, 'ui-style lint clean ' + J(lint(read('ui-style'))));
  let sui;
  r = await exec(read('ui-style'), [], { uiReady: u => { sui = u; } });
  ok(sui && sui.css.includes('#cit-app #Click { background-color: blue; color: hsl(0, 0%, 100%); border: 2px solid rgb(255, 255, 255); font-size: 18px; font-family: "Arial", sans-serif; width: 200px; height: 48px; }'), 'css for id.Click: ' + (sui && sui.css));
  ok(sui.css.includes('#cit-app [data-name="note"] { color: #ff8800; }'), 'css for name.x + hex()');
  ok(sui.css.includes('#cit-app button, #cit-app h2 {  }') && sui.css.includes('#cit-app * {  }'), 'css selectors ui.x and uni');
  const sty = (body) => 'import ui;\nimport ui-style;\nui.root r(style-connect="s()")\nend;\nui.style s()\n' + body + '\nend;\nvoid main()\nend;\nreturn error.NoErr;';
  const msgs = body => lint(sty(body)).map(p => p.message);
  ok(msgs(' class.a {\n color = 1;\n };').some(m => m.includes('Unknown style property')), 'unknown property');
  ok(msgs(' class.a {\n background-color = color("nope");\n };').some(m => m.includes('Unknown color name')), 'unknown color');
  ok(msgs(' class.a {\n background-color = rgb(300, 0, 0);\n };').some(m => m.includes('0 to 255')), 'rgb range');
  ok(msgs(' class.a {\n width = 10;\n };').some(m => m.includes('Expected a size')), 'size needs unit');
  ok(msgs(' class.a {\n border-type = wavy;\n };').some(m => m.includes('Border type')), 'border type');
  ok(msgs(' class.a {\n border = px(1), px(2);\n };').some(m => m.includes('two size')), 'border duplicate size');
  ok(msgs(' class.a {\n font-family = "Papyrus";\n };').length === 1 && lint(sty(' class.a {\n font-family = "Papyrus";\n };')).some(p => p.severity === 'warning'), 'font warning only');
  ok(msgs(' ui.nope {};').some(m => m.includes('Unknown UI element')), 'unknown ui selector');
  ok(msgs(' class.a {\n width = px(1);\n end;').some(m => m.includes('`};`')), 'rule must close with };');
  ok(msgs(' width = px(1);').some(m => m.includes('Only style rules')), 'property outside a rule');
  ok(lint('import ui;\nui.root r(style-connect="nope()")\nend;\nvoid main()\nend;\nreturn error.NoErr;').some(p => p.message.includes('Unknown style sheet')), 'unknown sheet');
  ok(lint(read('ui-style').replace('import ui-style;\n', '')).some(p => p.severity === 'warning' && p.message.includes('import ui-style')), 'import ui-style warning');
  ok(lint('ui.root r()\nend;\nvoid main()\nend;\nreturn error.NoErr;').some(p => p.severity === 'warning' && p.message.includes('import ui;')), 'import ui warning');
  ok(lint(read('ui-style').replace('hex("ff8800")', 'hex("zz")')).some(p => p.message.includes('hex()')), 'bad hex');

  // ---- ui inputs + events
  ok(lint(read('ui-input')).length === 0 && lint(read('ui-events')).length === 0, 'input examples lint clean');
  const iout = [], ivals = []; let iui, ifire;
  r = await run(read('ui-events'), { write: l => iout.push(l), input: async () => '', uiReady: (u, f) => { iui = u; ifire = f; }, uiValue: (n, v) => ivals.push([n, v]) });
  ok(iui.elements.length === 4 && iui.elements[0].kind === 'input', 'inputs created');
  ok(iui.elements[0].attrs.type === 'password' && iui.elements[0].attrs.minLength === '2' && iui.elements[0].attrs.maxLength === '16', 'input attrs');
  ok(iui.elements[2].attrs.required === 'True' && iui.elements[2].attrs.type === 'email', 'bare required flag + attrs without commas');
  ok(iui.elements[1].text === 'Placeholder' && iui.elements[1].value === '', 'placeholder vs value');
  await ifire('text_inp', 'focus'); await ifire('passwords', 'focusEnd'); await ifire('email_inp', 'typed', 'a@b.c'); await ifire('passwords', 'typed', 'x');
  ok(J(iout) === J(['You are focusing on inputs', 'You stopped focusing', 'You are typing', 'email valid: True', 'You are typing']), 'multi-target events ' + J(iout));
  ok(iui.elements[2].value === 'a@b.c', 'typed value is stored');
  await ifire('email_inp', 'typed', 'nope');
  ok(iout[iout.length - 1] === 'email valid: False', 'email validation');
  r = await exec('import ui;\nui.root r()\n ui i -> ui.input(minLength=3, required) = "p";\nend;\nvoid main()\n console.write(i.valid);\n i.value = "abcd";\n console.write(i.valid);\n console.write(i.value);\n console.write(i.placeholder);\nend;\nreturn error.NoErr;');
  ok(J(r.out) === J(['False', 'True', 'abcd', 'p']), 'input .valid / .value setter / .placeholder ' + J(r.out) + J(r.error));
  r = await exec('import ui;\nui.root r()\n ui i -> ui.input(type="color") = "p";\nend;\nvoid main()\nend;\nreturn error.NoErr;');
  ok(r.error && /type must be one of/.test(r.error.message), 'bad input type');
  r = await exec('import ui;\nui.root r()\n ui b -> ui.button() = "p";\nend;\nvoid main()\n b.typed(func f()\n end);\nend;\nreturn error.NoErr;');
  ok(r.error && /no 'typed' event/.test(r.error.message), 'event not valid for element');
  r = await exec('import ui;\nui.root r()\n ui a -> ui.button() = "a";\n ui b -> ui.button() = "b";\nend;\nvoid main()\n a && b.clicked(func f()\n console.write("c");\n end);\nend;\nreturn error.NoErr;', [], { uiReady: (u, f) => { ifire = f; } });
  await ifire('a'); await ifire('b');
  ok(r.exit === 'NoErr', 'multi-target clicked registers');

  // ---- switch
  r = await exec(main(' default num n = 2;\n switch (n) do\n case 1, 2 do\n console.write("one or two");\n end;\n case 3 do\n console.write("three");\n end;\n end;'));
  ok(J(r.out) === '["one or two"]', 'case with several values');
  r = await exec(main(' default num n = 9;\n switch (n) do\n case 1 do\n console.write("x");\n end;\n default do\n console.write("other");\n end;\n end;\n console.write("after");'));
  ok(J(r.out) === '["other","after"]', 'default case');
  r = await exec(main(' switch (5) do\n case 1 do\n console.write("x");\n end;\n end;\n console.write("after");'));
  ok(J(r.out) === '["after"]', 'no match, no default');
  r = await exec(main(' for (default num i, range = 0, 3) do\n switch (i) do\n case 1 do\n break;\n console.write("no");\n end;\n default do\n console.write(i);\n end;\n end;\n end;'));
  ok(J(r.out) === '["0","2"]', 'break leaves only the switch');
  r = await exec(main(' default enum C do\n C.A;\n C.B;\n end;\n default enum c = C.B;\n switch (c) do\n case C.A do\n console.write("a");\n end;\n case C.B do\n console.write("b");\n end;\n end;'));
  ok(J(r.out) === '["b"]', 'switch on enum ' + J(r));
  ok(lint(read('switch')).length === 0, 'switch lint clean');
  ok(lint(main(' switch (1) do\n console.write("x");\n end;')).some(p => p.message.includes('belong directly inside a switch')), 'statement directly in switch');
  ok(lint(main(' case 1 do\n end;')).some(p => p.message.includes('belong directly inside')), 'case outside switch');
  ok(lint(main(' switch (1) do\n default do\n end;\n default do\n end;\n end;')).some(p => p.message.includes('only have one `default')), 'two defaults');
  ok(lint(main(' switch (1) do\n case 1 do\n continue;\n end;\n end;')).some(p => p.message.includes('`continue`')), 'continue in switch needs a loop');

  // ---- try / catch / finally / except
  ok(lint(read('try')).length === 0 && lint(read('try-catch')).length === 0, 'try examples lint clean');
  r = await exec(main(' try do\n console.write("a");\n finally do\n console.write("f");\n end;'));
  ok(J(r.out) === '["a","f"]', 'try + finally only');
  r = await exec(main(' try do\n default list l = [1];\n l[5] = 1;\n catch (e) do\n console.write(e.message);\n console.write(e.line);\n end;'));
  ok(r.out[0] === 'Index 5 is out of range (size 1).' && r.out[1] === '4', 'catching runtime errors, err.line (1-based) ' + J(r));
  r = await exec(main(' try do\n default num n = parseInt("abc");\n catch (e) do\n console.write(e.name);\n end;'));
  ok(r.out[0] === 'ValueError', 'failed casts are ValueError');
  r = await exec(main(' try do\n raise error.Custom;\n catch do\n console.write("no variable needed");\n end;'));
  ok(r.out[0] === 'no variable needed', 'catch without a variable');
  r = await exec(main(' try do\n try do\n raise error.A;\n finally do\n console.write("inner finally");\n end;\n catch (e) do\n console.write("outer " + e.name);\n end;'));
  ok(J(r.out) === '["inner finally","outer A"]', 'errors travel through finally to an outer catch ' + J(r));
  r = await exec(main(' try do\n default num x = 1 / 0;\n finally do\n console.write("cleanup");\n end;\n console.write("not reached");'));
  ok(J(r.out) === '["cleanup"]' && r.error && /Division/.test(r.error.message), 'finally runs, then the error continues ' + J(r));
  r = await exec(main(' func f() do\n try do\n return 1;\n finally do\n console.write("fin");\n end;\n end;\n console.write(f());'));
  ok(J(r.out) === '["fin","1"]', 'finally runs on return ' + J(r.out));
  r = await exec(main(' for (default num i, range = 0, 3) do\n try do\n if (i == 1) do\n continue;\n end;\n console.write(i);\n finally do\n console.write("f");\n end;\n end;'));
  ok(J(r.out) === '["0","f","f","2","f"]', 'continue/break pass through try ' + J(r.out));
  r = await exec(main(' try do\n return error.Err;\n catch (e) do\n console.write("caught");\n end;'));
  ok(r.exit === 'Err' && r.out.length === 0, 'return error.X is an exit, not a catchable error');
  r = await exec(main(' try do\n raise error.Boom;\n catch (e) do\n console.write("x");\n raise error.Again;\n end;'));
  ok(r.exit === 'Again' && J(r.out) === '["x"]', 'raise inside catch');
  ok(lint(main(' try do\n end;')).some(p => p.message.includes('needs a `catch`')), 'try alone');
  ok(lint(main(' try do\n finally do\n catch do\n end;')).some(p => p.message.includes('before `finally`')), 'catch after finally');
  ok(lint(main(' try do\n catch do\n except do\n end;')).some(p => p.message.includes('only have one')), 'two catches');
  ok(lint(main(' catch do\n end;')).some(p => p.message.includes('without a matching `try`')), 'catch without try');
  ok(lint(main(' try do\n catch (err do\n end;')).some(p => p.severity === 'error'), 'malformed catch');
  ok(closerFor('void main()\n    try do\n        \n', 1) === 'end;', 'closer try');
  ok(closerFor('void main()\n    switch (1) do\n        \n', 1) === 'end;', 'closer switch');
  ok(closerFor('ui.style s()\n    class.a {\n        \n', 1) === '};', 'closer style rule');
  ok(closerFor('ui.style s()\n    \n', 0) === 'end;', 'closer ui.style');


  // ---- ui style states + pointer events
  const stateMsgs = body => lint('import ui;\nimport ui-style;\nui.root r(style-connect="s()")\nend;\nui.style s()\n' + body + '\nend;\nvoid main()\nend;\nreturn error.NoErr;').map(p => p.message);
  ok(lint(read('ui-states')).length === 0, 'ui-states lint clean ' + J(lint(read('ui-states'))));
  let stui; const stout = []; let stfire;
  r = await run(read('ui-states'), { write: l => stout.push(l), input: async () => '', uiReady: (u, f) => { stui = u; stfire = f; } });
  ok(stui.css.includes('#cit-app #Click:hover { background-color: orange; }'), 'hover css ' + stui.css);
  ok(stui.css.includes('#cit-app #Click.cit-hover-end { background-color: lightyellow; }'), 'hoverEnd css');
  ok(stui.css.includes('#cit-app #Click:active { background-color: red; transform: scale(0.95); }'), 'active css');
  ok(stui.css.includes('#cit-app #Click.cit-clicked { border-color: green; }'), 'clicked css');
  await stfire('my_button', 'hover'); await stfire('my_button', 'active'); await stfire('my_button', 'hoverEnd');
  ok(J(stout) === '["hover","active","hoverEnd"]', 'hover / active / hoverEnd events ' + J(stout));
  ok(stateMsgs(' id.A.nope() {};').length > 0, 'unknown state is not a selector');
  ok(stateMsgs(' ui.nope.hover() {};').some(m => m.includes('Unknown UI element')), 'state on unknown element');
  ok(stateMsgs(' uni.hover() {};').length === 0 && stateMsgs(' class.a.active() { width = px(1); };').length === 0, 'states on uni / class');

  // ---- all style tags
  ok(lint(read('ui-style-tags')).length === 0, 'ui-style-tags lint clean ' + J(lint(read('ui-style-tags'))));
  r = await exec(read('ui-style-tags'), [], { uiReady: u => { stui = u; } });
  const css = stui.css;
  ok(css.includes('display: flex;') && css.includes('margin: 10px 20px;') && css.includes('padding: 8px;'), 'display / margin / padding ' + css);
  ok(css.includes('border-radius: 12px;') && css.includes('position: relative;'), 'border-corner / position');
  ok(css.includes('transform: translate(5px, 0px) rotate(2deg) scale(1.1);'), 'transform');
  ok(css.includes('border-color: hwb(120 10% 10%);') && css.includes('color: rgba(255, 255, 255, 0.9);') && css.includes('font-size: 1.2em;'), 'colors and units');
  ok(stateMsgs(' class.a {\n display = table;\n };').some(m => m.includes('must be one of')), 'bad display');
  ok(stateMsgs(' class.a {\n position = floating;\n };').some(m => m.includes('must be one of')), 'bad position');
  ok(stateMsgs(' class.a {\n margin = px(1), px(2), px(3), px(4), px(5);\n };').some(m => m.includes('1 to 4')), 'too many margin sizes');
  ok(stateMsgs(' class.a {\n transform = move(1);\n };').some(m => m.includes('translate()')), 'bad transform');
  ok(stateMsgs(' class.a {\n transform = translate(1, 2);\n };').some(m => m.includes('translate() needs')), 'translate needs sizes');
  ok(stateMsgs(' class.a {\n transform = rotate(px(1));\n };').some(m => m.includes('rotate() needs')), 'rotate needs a number');

  // ---- `is` in when (>> still works)
  r = await exec(read('when-is'));
  ok(lint(read('when-is')).length === 0 && J(r.out) === '["My grade is A"]', 'when ... is');
  ok(lint(main(' (1 == 1) is pass;')).some(p => p.message.includes('belong inside a `when')), '`is` case outside when');
  r = await exec(main(' default num n = 5;\n when (n) do\n (n > 9) is console.write("big");\n else is console.write("small");\n end;'));
  ok(J(r.out) === '["small"]', 'else is');

  // ---- math module
  ok(lint(read('math')).length === 0, 'math lint clean');
  r = await exec(main(' console.write(math.sqrt(4));'));
  ok(r.error && /Add `import math;`/.test(r.error.message), 'math needs an import');
  ok(lint(main(' console.write(math.sqrt(4));')).some(p => p.severity === 'warning' && p.message.includes('import math')), 'math import warning');
  ok(lint(main(' console.write("math.sqrt(4)");')).length === 0, 'math in a string is fine');
  r = await exec('import math;\n' + main(' console.write(math.sqrt(-1));'));
  ok(r.error && r.exit === 'ValueError', 'sqrt(-1) is a ValueError ' + J(r));
  r = await exec('import math;\n' + main(' console.write(math.log(0));'));
  ok(r.error && /greater than 0/.test(r.error.message), 'log(0)');
  r = await exec('import math;\n' + main(' console.write(math.factorial(-1));'));
  ok(r.error && /0 or more/.test(r.error.message), 'factorial(-1)');
  r = await exec('import math;\n' + main(' console.write(math.pi);\n console.write(math.log(100, 10));\n console.write(math.cos(0));\n console.write(math.radians(180) == math.pi);'));
  ok(J(r.out) === '["3.141592653589793","2","1","True"]', 'math misc ' + J(r.out) + J(r.error));
  r = await exec('import math;\n' + main(' console.write(math.sqrt);'));
  ok(r.error && /is a function/.test(r.error.message), 'math.sqrt without ()');

  // ---- sets
  r = await exec(main(' default list s = {(1, 2), (1, 2), "a"};\n console.write(s);\n console.write(s.length);\n console.write(len(s));'));
  ok(J(r.out) === '["{(1, 2), \\"a\\"}","2","2"]', 'set with tuples ' + J(r.out) + J(r.error));
  r = await exec(main(' default list s = {[1], 2};'));
  ok(r.error && /cannot be an item of a set/.test(r.error.message), 'list in a set');
  r = await exec(main(' default list s = {1};\n s.remove(9);'));
  ok(r.error && /not in the set/.test(r.error.message), 'remove missing');
  r = await exec(main(' default list s = {1};\n s.discard(9);\n console.write(s == {1});\n console.write({1, 2} == {2, 1});\n console.write(set() | {3});'));
  ok(J(r.out) === '["True","True","{3}"]', 'discard + set equality ' + J(r.out) + J(r.error));
  r = await exec(main(' console.write({1} | 5);'));
  ok(r.error && /two sets/.test(r.error.message), 'set op with a non-set');
  r = await exec(main(' console.write(5 | 3);'));
  ok(r.error && /works on sets/.test(r.error.message), '| on numbers');
  r = await exec(main(' default list d = {};\n default list s = {name: 1};\n console.write(d);\n console.write(s);'));
  ok(J(r.out) === '["{}","{name: 1}"]', '{} is a dictionary, {k: v} too');

  // ---- optional
  r = await exec(main(' default ? x = Null;\n x = [1];\n x = "s";\n console.write(x);'));
  ok(r.out[0] === 's', 'optional takes any type');
  r = await exec(main(' default num n = 1;\n n = "s";'));
  ok(r.error && /cannot assign/.test(r.error.message), 'typed variables stay typed');

  // ---- builtins
  r = await exec(main(' console.write(max());'));
  ok(r.error && /at least one value/.test(r.error.message), 'max()');
  r = await exec(main(' console.write(max(1, "a"));'));
  ok(r.error && /only numbers or only strings/.test(r.error.message), 'max mixed');
  r = await exec(main(' console.write(len(5));'));
  ok(r.error && /len\(\) needs/.test(r.error.message), 'len(5)');
  r = await exec(main(' console.write(list());\n console.write(tuple());\n console.write(set());\n console.write(list({a: 1, b: 2}));\n console.write(max("b", "a"));'));
  ok(J(r.out) === J(['[]', '()', 'set()', '["a", "b"]', 'b']), 'empty constructors, dict keys ' + J(r.out));
  r = await exec('void main()\n default classIns p = P();\n console.write(isinstance(p, "list"));\n console.write(issubclass(5, P));\nend;\nclass P() do\nend;\nreturn error.NoErr;');
  ok(r.error && /class name/.test(r.error.message), 'issubclass needs classes ' + J(r));
  r = await exec(main(' default enum C do\n C.A;\n end;\n default enum x = C.A;\n console.write(isinstance(x, C));\n console.write(type(x));'));
  ok(J(r.out) === '["True","C"]', 'isinstance with an enum ' + J(r.out) + J(r.error));
  r = await exec('void main()\n func max(a, b) do\n return 42;\n end;\n console.write(max(1, 2));\nend;\nreturn error.NoErr;');
  ok(r.out[0] === '42', 'a user function can replace a built-in');

  // ---- strings
  r = await exec(main(' default string s = "abc";\n console.write(s.toUpperCase());\n console.write(s);\n console.write(s.replace("b", "x"));\n console.write("Hello".includes("ell"));\n console.write("a-b-c".replace("-" => ""));'));
  ok(J(r.out) === J(['ABC', 'abc', 'axc', 'True', 'abc']), 'in an expression a string method does not change the variable ' + J(r.out) + J(r.error));
  r = await exec(main(' default string s = "abc";\n s.nope();'));
  ok(r.error && /no method 'nope'/.test(r.error.message), 'unknown string method');
  r = await exec(main(' default string s = "abc";\n s.replace("a" => 1);'));
  ok(r.error && /replace needs strings/.test(r.error.message), 'replace needs strings');
  r = await exec(main(' default string s = "abc";\n console.write(s.substring(1));\n console.write(s.substring(2, 1));'));
  ok(J(r.out) === '["bc","b"]', 'substring like JavaScript ' + J(r.out));
  r = await exec(main(' default string s = "x";\n s.includes("x");\n console.write(s);'));
  ok(r.out[0] === 'x', 'includes as a statement changes nothing');

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
