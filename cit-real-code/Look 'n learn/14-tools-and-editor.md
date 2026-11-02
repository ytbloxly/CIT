# 14. Tools and editor

Everything you need comes with the **CIT VS Code extension**.

## Running a program

Open a `.cit` or `.ct` file, then press the **Play** button at the top right of the editor (or `Ctrl+F5`, or right-click and choose *Run CIT File*).

Running has two steps, and you see both in the terminal:

1. **Compiling.** CIT reads your whole file and checks that it is valid. Typing mistakes (a missing bracket, `let` without a name...) are found here, **before anything runs**, and shown in red with their line. Nothing is executed when compiling fails.
2. **Running.** The compiled program runs in a VS Code terminal named **CIT**.

```text
> cit hello.cit
[CIT] Compiling hello.cit...
[CIT] Compiled in 1 ms. Running...

Hello, World!

[CIT] Finished successfully (bundled CIT VM).
```

Everything is built in. You do not need to install a compiler or anything else.

### The terminal

- `println` text is normal, `warnln` is **yellow**, `errorln` and error messages are **red**.
- `input("question")` waits for you to **type in the terminal** and press Enter. Backspace works.
- `Ctrl+C` stops a running program (or cancels the line you are typing).
- Running again reuses the same terminal and clears it.

## Commands (Command Palette, `Ctrl+Shift+P`)

| Command | What it does |
| --- | --- |
| **CIT: Run File** | compile and run (same as the Play button) |
| **CIT: Check Syntax** | compile only, to look for mistakes without running |
| **CIT: Compile to Bytecode** | write a `.citbc.json` file next to your source |
| **CIT: Open ipcit (Package Manager)** | the `ipcit>` terminal ([chapter 13](13-modules-and-ipcit.md)) |
| **CIT: Open Look 'n learn (Docs)** | opens this guide |
| **Format Document** | tidy the file (see below), or `Shift+Alt+F` |

The bytecode file is a compiled version of your program. It is portable and runs on the CIT VM, but it is not a native Windows/macOS/Linux program.

## Format Document

Choose **Format Document** (or press `Shift+Alt+F`) and CIT tidies your code:

- re-indents every line (4 spaces per level; it follows your editor's tab settings),
- puts one space around operators and after commas, and none inside `( )` and `[ ]`,
- writes `if (`, `while (`, `for (`, `switch (`, `catch (` with a space, but calls like `print(x)` without one,
- puts a space inside one-line blocks `{ like this }`, but leaves dictionaries as you wrote them (`{a: 1}` or `{ a: 1 }`),
- removes trailing spaces, and squeezes several blank lines into one,
- ends the file with a single new line.

It never joins or splits lines, never touches the inside of text, multi-line strings or comments, and the formatted program always does exactly the same as before. If your file has a typing mistake that stops the formatter from reading it (such as a text without a closing quote), it tells you and changes nothing.

Before:

```cit
let   total=1+2*3
if(total>5&&!(total==9)){
println( "big" )
}else{
for(let mut i,range(0,10,2)){
i++
}
}
```

After formatting:

```cit
let total = 1 + 2 * 3
if (total > 5 && !(total == 9)) {
    println("big")
} else {
    for (let mut i, range(0, 10, 2)) {
        i++
    }
}
```

To format every time you save, turn on VS Code's setting **Editor: Format On Save**.

## Colors in the editor

Code is colored with the same standard scopes other languages use, so it matches your theme. Keywords (`if`, `try`, `defer`...), `let` / `fn` / `class`, strings (including multi-line ones), numbers, comments, built-in functions and methods are colored. Variable names and dictionary keys are left plain on purpose.

## Snippets

Type a prefix and press `Tab`:

| Prefix | Inserts |
| --- | --- |
| `hello` | a hello world |
| `letmut` / `typed` / `letempty` / `letmulti` | variable declarations |
| `if` / `while` / `dowhile` | conditions and loops |
| `forrange` / `forstep` / `forin` | `for` loops |
| `switch` | `switch` / `case` |
| `fn` / `fnexpr` / `lambda` | functions |
| `class` / `classinherit` | classes |
| `list` / `dict` / `rangef` | collections |
| `try` / `throw` / `defer` | errors and clean-up |
| `multiline` | a multi-line string |
| `inop` | the `in` operator |
| `castfallback` / `randint` | conversions and random numbers |
| `safe` | a safe call `x?.method()` |
| `import` / `importas` | imports |
| `input` / `errorln` / `warnln` | input and colored output |

## The `cit` and `ipcit` commands

In terminals opened inside VS Code (with Node.js installed), these commands are available:

```text
cit hello.cit        compile and run a file (colors and typed input work here too)
ipcit install ./pkg  the package manager
```

## File types

| Extension | Meaning |
| --- | --- |
| `.cit` | CIT source code |
| `.ct` | CIT source code (short form) |
| `.citbc.json` | compiled bytecode |

## Try it yourself

1. Mess up the spacing in one of the examples on purpose, then use **Format Document**.
2. Break a line (delete a `)`) and press Play. Read the compile error.
3. Open the Command Palette and run **CIT: Check Syntax**.

Previous: [13. Modules and ipcit](13-modules-and-ipcit.md) | Next: [15. Cheat sheet](15-cheat-sheet.md)
