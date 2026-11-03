# 2. Variables and types

A **variable** is a name for a value.

## `let` and `let mut`

`let` creates a variable that **cannot be changed** afterwards. `let mut` creates one that can.

```cit
let language = "CIT"
let mut score = 0
score = score + 10
println(language, score)
```

Output:

```text
CIT 10
```

Trying to change a plain `let` variable is an error. This protects you from accidental changes:

```cit
let language = "CIT"
language = "Other"
```

Result:

```text
[CIT Error] Line 2, column 1: Cannot reassign immutable variable 'language'. Use 'let mut'.
```

Rule of thumb: use `let`, and switch to `let mut` only when the value really has to change.

## Types

Every value has a type. CIT works out the type itself.

| Type | Examples | What it is |
| --- | --- | --- |
| `int` | `42`, `-7` | whole numbers |
| `float` | `3.14`, `-0.5` | numbers with a decimal point |
| `str` | `"hello"` | text |
| `char` | `'a'` | exactly one character |
| `bool` | `true`, `false` | yes or no |
| `null` | `null` | "nothing here" |
| `list` | `[1, 2, 3]` | an ordered collection ([chapter 7](07-lists.md)) |
| `dict` | `{name: "Ada"}` | key/value pairs ([chapter 8](08-dictionaries.md)) |
| `function` | `fn add(a, b) { ... }` | code you can call ([chapter 9](09-functions.md)) |
| `class` / object | `person("Ada", 36)` | your own kinds of things ([chapter 10](10-classes.md)) |

A variable keeps its type. Putting a different type into it is an error:

```cit
let mut age = 30
age = "thirty"
```

Result:

```text
[CIT Error] Line 2, column 1: Type mismatch: expected int, received str.
```

The one exception: a number variable may become a `float` when it needs to hold a decimal value.

```cit
let mut average = 7
average = average / 2
println(average)
```

Output:

```text
3.5
```

## Typed variables

You can state the type yourself with `int`, `float`, `str`, `char` or `bool`. CIT checks that the value fits.

```cit
int age = 23
float price = 9.99
str title = "CIT"
char grade = 'A'
bool done = false
println(age, price, title, grade, done)
```

Output:

```text
23 9.99 CIT A false
```

```cit
int age = 2.5
```

Result:

```text
[CIT Error] Line 1, column 5: Type mismatch: expected int, received float.
```

Typed variables are fixed, like `let`. A `float` variable accepts whole numbers too (`float price = 5` is fine).

## Empty variables

Sometimes you know the name now but the value later. Declare it without a value. **An empty variable must be `let mut`**, because otherwise it could never get a value and would stay empty forever.

```cit
let mut name
println(name)
name = "Coder"
println(name)
```

Output:

```text
null
Coder
```

Its type is decided by the first value you put in:

```cit
let mut name
name = "Coder"
name = 5
```

Result:

```text
[CIT Error] Line 3, column 1: Type mismatch: expected str, received int.
```

Forgetting `mut` is a compile error with a helpful message:

```cit
let name
```

Result:

```text
[CIT Error] Line 1, column 5: 'name' has no value, so it must be declared with 'let mut'. Example: let mut name
```

## Declaring several variables at once

```cit
let a, b, c = 2, 3, 4
println(a, b, c)

let mut x, y = 10, 20
x += 1
y += 1
println(x, y)
```

Output:

```text
2 3 4
11 21
```

The number of names and values must match. All the values are worked out first, so this swaps-style trick works:

```cit
let first = "one"
let second = "two"
let newFirst, newSecond = second, first
println(newFirst, newSecond)
```

Output:

```text
two one
```

You can also create several empty variables: `let mut a, b`.

One value can be shared across several names:

```cit
let mut a, b, c = 2
println(a, b, c)
```

Output:

```text
2 2 2
```

## Scope: where a variable lives

A variable exists from its declaration until the end of the `{ ... }` block it was created in.

```cit
if (true) {
    let inside = 1
}
println(inside)
```

Result:

```text
[CIT Error] Line 4, column 9: Undefined variable 'inside'.
```

A block may reuse a name that exists outside; the outer one is untouched:

```cit
let x = "outer"
if (true) {
    let x = "inner"
    println(x)
}
println(x)
```

Output:

```text
inner
outer
```

You cannot declare the same name twice in the **same** block:

```cit
let x = 1
let x = 2
```

Result:

```text
[CIT Error] Line 2, column 5: 'x' is already declared.
```

## `null`

`null` means "no value". Reading a property that does not exist gives `null`, and so does a function that returns nothing.

```cit
fn nothing() {
    pass
}
println(nothing())
```

Output:

```text
null
```

## Truthy and falsy

Conditions accept any value. These are **false**: `false`, `null`, `0`, `""` (empty text), `[]` (empty list) and `{}` (empty dictionary). Everything else counts as **true**.

```cit
if ("") { println("empty text is true") } else { println("empty text is false") }
if ([0]) { println("a list with an item is true") }
if (0) { println("zero is true") } else { println("zero is false") }
```

Output:

```text
empty text is false
a list with an item is true
zero is false
```

## Try it yourself

1. Make a `let mut` variable `lives` set to `3`, then subtract one.
2. Declare an empty variable and give it a value on the next line.
3. Use one `let` line to create `width`, `height` and `depth`.

Previous: [1. Getting started](01-getting-started.md) | Next: [3. Operators](03-operators.md)
