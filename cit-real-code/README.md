# CIT — Code Information Technology v0.8.0

CIT is a VS Code language extension for `.cit` and `.ct` files.

## Install normally — no F5

1. Open VS Code Extensions (`Ctrl+Shift+X`).
2. Open the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-0.8.0.vsix`.
4. Open a `.cit` or `.ct` file; VS Code automatically selects CIT.
5. Run using the editor's Play icon, the context menu, or `Ctrl+F5`.

F5 is only needed when developing/debugging the extension itself.

## Features

- Automatic `.cit` and `.ct` language detection and CIT language-mode selection.
- CIT logo, file icons, syntax highlighting, snippets and bracket matching.
- `println`, `errorln`, `warnln`, `input` and interpolated strings such as `$"Hello, {name}!"`.
- Inferred variables (`let`) and mutable inferred variables (`let mut`); typed declarations.
- Empty variables (`let mut name`, assigned later; they must be `mut`) and multiple assignment (`let a, b, c = 2, 3, 4`).
- Math shortcuts: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`.
- `if`, `elseif`, `else`, `while`, `do { ... } while (...)`, numeric `for`/`range` loops. The range end is exclusive: `range = 0, 3` visits 0, 1, 2.
- `break`, `continue`, `pass`, `return`.
- Functions, default parameters and named arguments (`fn add(a, b = 1)` / `add(2, b: 4)`).
- Classes, `fn struct(...)` constructors, `self` properties and methods.
- Lists (`[1, 2, 3]`, `nums[0]`) with `append`, `pop`, `insert`, `clear`, `remove`, `reverse`, `count`, `index` and `copy`. Changing a list needs `let mut`.
- Built-ins `range()`, `min()`, `max()`, `sum()`, `len()`.
- A function call or a function itself can be stored in a variable (`let x = add(12)`, `let f = add`).
- `castInt`, `castFloat`, `castString`, `castBool`.
- Logical/comparison/math operators, including `&&`, `||`, `!`, `//` and `**`.
- Bundled interpreter and CIT VM runner; no separate C compiler or Python install required.

## Running in the terminal

**Run** (Play icon, context menu or `Ctrl+F5`) now runs your program in a VS Code terminal named **CIT**.

- `println(...)` prints in the normal terminal color.
- `warnln(...)` prints in **yellow** (`[WARNING] ...`).
- `errorln(...)` prints in **red** (`[ERROR] ...`).
- Compile/runtime errors are also shown in red.
- `input("Prompt")` is typed right in the terminal: type your answer and press Enter. Backspace works.
- `Ctrl+C` stops a running program. Running again reuses the same terminal.

The `cit <file.cit>` command does the same from any terminal opened inside VS Code (needs Node.js installed).

## ipcit — the CIT package manager

Run **CIT: Open ipcit (Package Manager)** from the Command Palette for an `ipcit>` prompt (no Node.js needed), or type `ipcit ...` in any VS Code terminal (needs Node.js).

| Command | What it does |
| --- | --- |
| `ipcit init [name]` | Create `ipcit.json` in the project |
| `ipcit install [pkg[@version]]` | Install a package; with no name, install everything in `ipcit.json` |
| `ipcit install ./folder` | Install a package from a local folder |
| `ipcit uninstall <pkg>` | Remove a package |
| `ipcit list` | List installed packages |
| `ipcit search [term]` / `ipcit info <pkg>` | Browse the registry |

Packages are installed to `cit_packages/` and recorded in `ipcit.json`. Use them in code:

```
import "mypackage"
import "mypackage" as mp
println(mypackage.hello())
```

The registry (`registry/packages/`) is empty for now; see `registry/README.md` for how packages will be added.

## Toolbar

The editor toolbar uses icon-only Run, Compile and Check actions. Hover over an icon to see its tooltip. Full command names remain in the Command Palette.

## Compile output

**CIT: Compile to CIT Bytecode** creates a `.citbc.json` runtime bundle. It is a portable CIT VM source bundle in this version, not native machine code or a standalone Windows `.exe`. The bundled runtime executes it.

## Examples

See `examples/hello.cit`, `examples/features.cit` and `examples/lists.cit`.


## Syntax highlighting

CIT uses the same standard TextMate scopes as mainstream languages, so it looks like JavaScript or Python in your theme:
keywords (`if`, `import`, ...), declaration keywords (`let`, `mut`, `fn`, `class`), strings, numbers, comments,
`true`/`false`/`null`, built-in functions (`println`, `input`, `range`, `sum`, ...) and list methods (`append`, `pop`, ...), and the names in `fn name` / `class Name`.
Variable names, properties, punctuation and brackets are intentionally left uncolored. Colors come from your active VS Code theme.
