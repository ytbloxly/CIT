# 1. Getting started

## Your first program

A CIT program is a plain text file that ends in `.cit` (or `.ct`). There is no `main` function, no boilerplate and nothing to install apart from the VS Code extension: the first line you write is the first line that runs.

```cit
println("Hello, World!")
```

Output:

```text
Hello, World!
```

`println` prints a line of text. Text is written between double quotes.

Programs run from top to bottom, one statement per line. You may put a `;` at the end of a statement, but you never have to.

## Printing

CIT has three ways to print, and each one has its own color in the terminal:

| Function | Looks like | Color | Use it for |
| --- | --- | --- | --- |
| `println(...)` | `text` | normal | everything normal |
| `warnln(...)` | `[WARNING] text` | **yellow** | things that deserve attention |
| `errorln(...)` | `[ERROR] text` | **red** | things that went wrong |

```cit
println("Everything is fine")
warnln("The disk is almost full")
errorln("Could not open the file")
```

Output:

```text
Everything is fine
[WARNING] The disk is almost full
[ERROR] Could not open the file
```

You can give any number of values. They are printed on one line, separated by a space:

```cit
println("Name:", "Ada", "Age:", 36)
println(1 + 2, "apples")
println()
println("(the line above was empty)")
```

Output:

```text
Name: Ada Age: 36
3 apples

(the line above was empty)
```

`println` works with every kind of value: numbers, text, `true` / `false`, lists, dictionaries, even functions. Lists and dictionaries are printed the way you would write them.

```cit
println([1, 2, 3], {name: "Ada"}, true, null)
```

Output:

```text
[1, 2, 3] {name: "Ada"} true null
```

## Comments

Comments are notes for people. CIT ignores them.

```cit
# A comment starts with a hash and lasts until the end of the line
println("code")   # you can also put one after code

/* A block comment
   can cover many lines */
println("more code")
```

Output:

```text
code
more code
```

## Reading input

`input("question")` shows the question in the terminal and waits for you to type an answer and press Enter. The answer is always **text**, even if you type digits.

```cit
let name = input("What is your name? ")
println($"Nice to meet you, {name}!")
```

Output:

```text
What is your name? Ada
Nice to meet you, Ada!
```

To get a number, convert the text with `castInt` or `castFloat` (see [chapter 12](12-built-in-functions.md)):

```cit
let age = castInt(input("How old are you? "), fallback = 0)
println($"Next year you will be {age + 1}.")
```

Output:

```text
How old are you? 36
Next year you will be 37.
```

The `$"..."` text with `{...}` inside is called a **template string**. It is explained in [chapter 4](04-strings.md).

## Names

Names of variables and functions use letters, digits and `_`, and cannot start with a digit. Capital letters matter: `score` and `Score` are different names.

```cit
let first_name = "Ada"
let lastName = "Lovelace"
let score2 = 10
println(first_name, lastName, score2)
```

Output:

```text
Ada Lovelace 10
```

## Running your program

- **In VS Code:** open a `.cit` file and press the **Play** button (or `Ctrl+F5`). CIT first *compiles* your code, which finds typing mistakes before anything runs, and then runs it in a terminal. Details are in [chapter 14](14-tools-and-editor.md).
- **From a terminal:** `cit hello.cit`.
- **To stop** a running program, press `Ctrl+C` in the terminal.

## Try it yourself

1. Print your name in three different lines.
2. Ask for the user's favorite color and print `"I like <color> too!"`.
3. Print a warning in yellow and an error in red.

Next: [2. Variables and types](02-variables-and-types.md)
