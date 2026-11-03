# Look 'n learn

Welcome to **CIT 1 Gen**! This folder explains the language one chapter at a time. Examples are intended to be copied into `.cit` files and run with the bundled interpreter.

New to programming? Start at chapter 1 and read in order. Already know another language? Skim the chapters or jump to the [cheat sheet](15-cheat-sheet.md).

## Chapters

| # | Chapter | You will learn |
| --- | --- | --- |
| 1 | [Getting started](01-getting-started.md) | Writing and running a program, printing, comments, reading input |
| 2 | [Variables and types](02-variables-and-types.md) | `let`, `let mut`, typed variables, empty variables, scope, truthiness |
| 3 | [Operators](03-operators.md) | Math, comparing, `&&` `||` `!`, `in`, `+=`, `++`, precedence |
| 4 | [Strings](04-strings.md) | Quotes, `$"..."` templates, multi-line strings, 18 string methods |
| 5 | [Conditions](05-conditions.md) | `if` / `elseif` / `else` and `switch` / `case` |
| 6 | [Loops](06-loops.md) | `while`, `do-while`, `for` with `range` and steps, `for-in` |
| 7 | [Lists](07-lists.md) | Lists, indexing and 18 list methods, `map` / `filter` / `reduce` |
| 8 | [Dictionaries](08-dictionaries.md) | Key/value data and 11 dictionary methods |
| 9 | [Functions](09-functions.md) | Parameters, defaults, lambdas, closures, `defer` |
| 10 | [Classes](10-classes.md) | Classes, `self`, inheritance, `super()` |
| 11 | [Errors and safety](11-errors-and-safety.md) | `try` / `catch` / `throw`, `?.`, fallbacks, reading error messages |
| 12 | [Built-in functions](12-built-in-functions.md) | `println`, `input`, `cast...`, `range`, `min`, `max`, `sum`, `len`, `random`, `randint` |
| 13 | [Modules and ipcit](13-modules-and-ipcit.md) | `import`, packages and the `ipcit` package manager |
| 14 | [Tools and editor](14-tools-and-editor.md) | VS Code features, formatting, the `cit` command |
| 15 | [Cheat sheet](15-cheat-sheet.md) | Everything on one page |
| 16 | [Tuples, sets and math](16-collections-and-math.md) | Mixed collections, immutable tuples, sets and `math` |
| 17 | [Functions and built-ins](17-functions-and-builtins.md) | Decorators, inline conditions and useful built-ins |
| 18 | [UI and text files](18-ui-and-files.md) | HTML-style UI and UTF-8 file I/O |
| 19 | [Temporal variables and errors](19-temporal-variables-and-errors.md) | Expiring variables, typed errors, `finally` and enums |
| 20 | [CIT terminal and editor](20-terminal-and-editor.md) | CLI commands, hover and Go to Definition |

## Practice with the examples

The `examples` folder next to this one has a runnable program for every chapter (`01-hello-world.cit` to `15-mini-project.cit`). Open one in VS Code and press the Play button.

## How the pages are written

- A box like this means a code example you can copy and run:

```cit
println("Hello, CIT!")
```

Output:

```text
Hello, CIT!
```

- The **Output** that follows is exactly what the program prints.
- Some examples show an error on purpose. Those are marked **Result**.
- Words in `code style` are things you type.
