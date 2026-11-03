# CIT — Code Information Technology v0.8.3

CIT is a small, readable programming language with its own VS Code extension, a built-in compiler and interpreter, a formatter and a package manager. Files end in `.cit` or `.ct`.

## Install normally — no F5

1. Open VS Code Extensions (`Ctrl+Shift+X`).
2. Open the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-0.8.3.vsix`.
4. Open a `.cit` or `.ct` file; VS Code automatically selects CIT.
5. Run using the editor's Play icon, the context menu, or `Ctrl+F5`.

F5 is only needed when developing/debugging the extension itself.

## Learn CIT

- **`Look 'n learn`** is a 20-chapter guide covering the language, collections, math, decorators, UI, files and CLI. Run **CIT: Open Look 'n learn (Docs)** from the Command Palette, or open `Look 'n learn/README.md`.
- **`examples`** has one runnable program for each chapter (`01-hello-world.cit` to `15-mini-project.cit`), plus a guessing game.

## What the language has

- Variables: `let`, `let mut`, typed (`int`, `float`, `str`, `char`, `bool`), empty variables (`let mut name`), multiple assignment (`let a, b, c = 2, 3, 4`) and shared values (`let mut a, b, c = 2`).
- Operators: `+ - * / % // **`, comparisons, `&&` `||` `!`, the `in` operator, shortcuts (`+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`) and `n++` `++n` `n--` `--n`. (`and`, `or`, `not` were removed.)
- Control flow: `if` / `elseif` / `else`, ternary expressions, `switch` / `case`, `while`, `do { } while ( )`, `for` with optional bindings, `break`, `continue`, `pass`, `return`.
- Strings: `"text"`, `$"Hello, {name}!"`, multi-line `"""..."""`, and 18 string methods.
- Lists, dictionaries, heterogeneous sets and immutable tuples; constructors include `list`, `tuple`, `set`, `dict`, `frozendict` and `frozenset`.
- Functions with default and named arguments (`name: value` or `name = value`), lambdas (`x => x * x`), closures, function values, `defer`.
- Classes with `fn struct(...)`, `self`, inheritance, `super()`, and `private` / `protected` fields; decorated functions and enums.
- Errors: `try` / `catch` / typed `except` / `finally`, `raise`, safe navigation and conversion fallbacks.
- Modules: `import math`, `import ui`, multiple imports, local/package imports and the `ipcit` package manager.
- Math and utility functions: `printf`, `exchange`, `task.wait`, `zip`, `enumerate`, `type`, `round`, `id`, `isinstance`, `issubclass`, `bin` and `square`.
- Temporal variables expire after `<Ns>` seconds or `<Nl>` source lines.
- UI elements render in a basic HTML-style VS Code webview; `open(..., "write"/"append")` saves UTF-8 text files.

## Running

**Run** (Play icon, context menu or `Ctrl+F5`) works in two steps:

1. **Compile.** Your whole file is checked first. Typing mistakes are reported with their line **before anything runs**.
2. **Run.** The program runs in a VS Code terminal named **CIT**.

In the terminal:

- `println(...)` prints in the normal color, `warnln(...)` in **yellow** (`[WARNING] ...`), `errorln(...)` in **red** (`[ERROR] ...`). Errors are red too.
- `input("Prompt")` is typed right in the terminal: type your answer and press Enter. Backspace works.
- `Ctrl+C` stops a running program. Running again reuses the same terminal.

The `cit <file.cit>` command runs a program from a VS Code terminal. To enable it in Windows Command Prompt or PowerShell, install Node.js and run `npm.cmd link` once from the extension project folder.

The CLI also supports `cit --open trm`, `cit --crt file --nm main.cit`, `cit --enter main.cit` and `cit --dlt main.cit`.

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

CIT uses standard TextMate scopes, so it matches your theme. Hover over common keywords and built-ins for definitions; use **Go to Definition** (`F12` or `Ctrl+Click`) for local declarations.
