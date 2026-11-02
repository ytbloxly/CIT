# CIT — Code Information Technology v0.8.2

CIT is a small, readable programming language with its own VS Code extension, a built-in compiler and interpreter, a formatter and a package manager. Files end in `.cit` or `.ct`.

## Install normally — no F5

1. Open VS Code Extensions (`Ctrl+Shift+X`).
2. Open the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-0.8.2.vsix`.
4. Open a `.cit` or `.ct` file; VS Code automatically selects CIT.
5. Run using the editor's Play icon, the context menu, or `Ctrl+F5`.

F5 is only needed when developing/debugging the extension itself.

## Learn CIT

- **`Look 'n learn`** is a 15-chapter guide that explains every function and every part of the language, with runnable examples. Run **CIT: Open Look 'n learn (Docs)** from the Command Palette, or open `Look 'n learn/README.md`.
- **`examples`** has one runnable program for each chapter (`01-hello-world.cit` to `15-mini-project.cit`), plus a guessing game.

## What the language has

- Variables: `let`, `let mut`, typed (`int`, `float`, `str`, `char`, `bool`), empty variables (`let mut name`), multiple assignment (`let a, b, c = 2, 3, 4`).
- Operators: `+ - * / % // **`, comparisons, `&&` `||` `!`, the `in` operator, shortcuts (`+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`) and `n++` `++n` `n--` `--n`. (`and`, `or`, `not` were removed.)
- Control flow: `if` / `elseif` / `else`, `switch` / `case`, `while`, `do { } while ( )`, `for (let i, range(0, 12))`, `for (let mut i, range(0, 12, 2))`, `for (let item in list)`, `break`, `continue`, `pass`, `return`.
- Strings: `"text"`, `$"Hello, {name}!"`, multi-line `"""..."""`, and 18 string methods.
- Lists (18 methods, including `map` / `filter` / `reduce`), dictionaries (11 methods), numbers with `toFixed`.
- Functions with default and named arguments (`name: value` or `name = value`), lambdas (`x => x * x`), closures, function values, `defer`.
- Classes with `fn struct(...)`, `self`, inheritance (`class builder(person())`) and `super()`.
- Errors: `try` / `catch` / `throw`, safe navigation `value?.method()`, `castInt(text, fallback = 0)`.
- Built-ins: `println`, `warnln`, `errorln`, `input`, `castInt`, `castFloat`, `castString`, `castBool`, `range`, `min`, `max`, `sum`, `len`, `random`, `randint`.
- Modules: `import "./file"`, `import "package"`, and the `ipcit` package manager.

## Running

**Run** (Play icon, context menu or `Ctrl+F5`) works in two steps:

1. **Compile.** Your whole file is checked first. Typing mistakes are reported with their line **before anything runs**.
2. **Run.** The program runs in a VS Code terminal named **CIT**.

In the terminal:

- `println(...)` prints in the normal color, `warnln(...)` in **yellow** (`[WARNING] ...`), `errorln(...)` in **red** (`[ERROR] ...`). Errors are red too.
- `input("Prompt")` is typed right in the terminal: type your answer and press Enter. Backspace works.
- `Ctrl+C` stops a running program. Running again reuses the same terminal.

The `cit <file.cit>` command does the same from any terminal opened inside VS Code (needs Node.js installed).

## Format Document

Use **Format Document** (`Shift+Alt+F`) to tidy a file: indentation (follows your tab settings, 4 spaces by default), spacing around operators and after commas, `if (` / `while (` / `for (`, one-line blocks, trailing spaces and blank lines. It never joins or splits lines, never touches the inside of strings or comments, and refuses to run if it could change what your program does.

## Commands

| Command | What it does |
| --- | --- |
| **CIT: Run File** | compile and run |
| **CIT: Check Syntax** | compile only |
| **CIT: Compile to Bytecode** | write a `.citbc.json` bundle next to the source |
| **CIT: Open ipcit (Package Manager)** | the `ipcit>` terminal |
| **CIT: Open Look 'n learn (Docs)** | the guide |

The toolbar shows icon-only Run, Compile and Check actions; hover an icon to see its tooltip.

## ipcit — the CIT package manager

Run **CIT: Open ipcit (Package Manager)** for an `ipcit>` prompt (no Node.js needed), or type `ipcit ...` in any VS Code terminal (needs Node.js).

| Command | What it does |
| --- | --- |
| `ipcit init [name]` | Create `ipcit.json` in the project |
| `ipcit install [pkg[@version]]` | Install a package; with no name, install everything in `ipcit.json` |
| `ipcit install ./folder` | Install a package from a local folder |
| `ipcit uninstall <pkg>` | Remove a package |
| `ipcit list` | List installed packages |
| `ipcit search [term]` / `ipcit info <pkg>` | Browse the registry |

Packages are installed to `cit_packages/` and recorded in `ipcit.json`. Use them with `import "mypackage"`. The registry (`registry/packages/`) is empty for now; see `registry/README.md`.

## Compile output

**CIT: Compile to Bytecode** writes a `.citbc.json` bundle: your program already compiled to a syntax tree (version 3; older version 2 bundles still run). It is portable CIT VM bytecode, not native machine code or a standalone `.exe`.

## Syntax highlighting

CIT uses the same standard TextMate scopes as mainstream languages, so it matches your theme: keywords (`if`, `try`, `defer`...), `let` / `fn` / `class`, strings (including multi-line ones), numbers, comments, `true` / `false` / `null`, built-in functions, and list / dictionary / string / number methods. Variable names, dictionary keys, punctuation and brackets are intentionally left uncolored.
