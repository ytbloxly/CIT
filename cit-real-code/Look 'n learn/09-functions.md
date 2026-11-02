# 9. Functions

A **function** is a named piece of code you can run whenever you like.

## Defining and calling

```cit
fn greet(name) {
    println($"Hello, {name}!")
}

greet("Ada")
greet("Linus")
```

Output:

```text
Hello, Ada!
Hello, Linus!
```

> **Define a function before the line that calls it.** CIT reads the file from top to bottom, so a call that comes *before* the `fn` does not know the function yet.

## Returning a value

`return` hands a value back and ends the function. A function without `return` gives back `null`.

```cit
fn square(x) {
    return x * x
}

let result = square(12)
println(result)
println(square(3) + square(4))
```

Output:

```text
144
25
```

The result of a call can be stored in a variable, printed, or used inside bigger expressions.

## Default values and named arguments

Give a parameter a default with `=`. Callers can then leave it out.

```cit
fn greet(name, greeting = "Hello") {
    return $"{greeting}, {name}!"
}
println(greet("Ada"))
println(greet("Ada", "Welcome"))
```

Output:

```text
Hello, Ada!
Welcome, Ada!
```

You can pass arguments **by name**, written `name: value` or `name = value`. Then the order does not matter:

```cit
fn box(width, height, label = "box") {
    return $"{label}: {width} x {height}"
}
println(box(3, 4))
println(box(height: 4, width: 3))
println(box(5, 6, label = "frame"))
```

Output:

```text
box: 3 x 4
box: 3 x 4
frame: 5 x 6
```

A missing argument without a default is an error:

```cit
fn add(a, b) {
    return a + b
}
println(add(1))
```

Result:

```text
[CIT Error] Line 1, column 1: Missing argument 'b'.
```

Parameters cannot be reassigned inside the function (they behave like `let`). Make a new variable if you need to change a value.

## Functions calling themselves (recursion)

```cit
fn factorial(n) {
    if (n <= 1) {
        return 1
    }
    return n * factorial(n - 1)
}
println(factorial(5))
```

Output:

```text
120
```

## Functions are values

A function can be stored in a variable, put in a list, passed to another function, or returned from one.

```cit
fn double(x) {
    return x * 2
}

let f = double              # no parentheses: the function itself, not a call
println(f(21))
println(f)

fn applyTwice(fn2, value) {
    return fn2(fn2(value))
}
println(applyTwice(double, 5))
```

Output:

```text
42
<fn double>
20
```

`let x = double(12)` (with parentheses) stores the **result** of the call; `let f = double` (without) stores the **function**.

## Lambdas: short functions

A **lambda** is a function without a name. There are several ways to write one.

**Arrow form** `parameters => result`:

```cit
let inc = x => x + 1
let add = (a, b) => a + b
let zero = () => 0
println(inc(1), add(2, 3), zero())
```

Output:

```text
2 5 0
```

**Without parentheses** around several parameters, and with `return`:

```cit
let rectangle = x, y => return x * y
println(rectangle(3, 4))
```

Output:

```text
12
```

**With a block** for longer bodies:

```cit
let describe = n => {
    if (n > 0) { return "positive" }
    return "not positive"
}
println(describe(5), describe(-1))
```

Output:

```text
positive not positive
```

**Function expression**, the normal `fn` form used as a value:

```cit
let square = fn square(x) {
    return x * x
}
let cube = fn(x) { return x * x * x }
println(square, cube)
println(square(4), cube(2))
```

Output:

```text
<fn square> <fn cube>
16 8
```

A lambda stored with `let name = ...` gets that name, which is why you see `<fn rectangle>` when you print it.

Inside `map(...)`, `filter(...)` and similar calls, write multi-parameter lambdas with parentheses: `(a, b) => a + b`.

```cit
let words = ["apple", "fig", "banana"]
println(words.map(w => w.upper()))
println(words.filter(w => len(w) > 3))
println(words.reduce((total, w) => total + len(w), 0))
```

Output:

```text
["APPLE", "FIG", "BANANA"]
["apple", "banana"]
14
```

## Closures

A function remembers the variables around the place where it was created.

```cit
fn makeCounter() {
    let mut count = 0
    return () => {
        count++
        return count
    }
}

let next = makeCounter()
println(next(), next(), next())
let other = makeCounter()
println(other())
```

Output:

```text
1 2 3
1
```

Each call of `makeCounter` creates a separate `count`.

```cit
fn adder(n) {
    return x => x + n
}
let addFive = adder(5)
println(addFive(10), adder(1)(1))
```

Output:

```text
15 2
```

## `defer`: do something when the function ends

`defer <statement>` remembers a statement and runs it **when the function finishes**, however it finishes: reaching the end, `return`, or an error. It is perfect for clean-up.

```cit
fn doSomething() {
    defer println("Prints last")
    println("Prints first")
}
doSomething()
```

Output:

```text
Prints first
Prints last
```

Rules:

- Several `defer` statements run in **reverse order**: the last one deferred runs first.
- The deferred statement runs at the end, so it sees the values variables have **then**.
- A `defer` inside an `if` or a loop still belongs to the surrounding **function**.
- `defer { ... }` can defer a whole block of statements.
- At the top level of a file, `defer` runs when the program ends.

```cit
fn demo() {
    defer println("1st deferred")
    defer println("2nd deferred")
    defer println("3rd deferred")
    println("function body")
}
demo()
```

Output:

```text
function body
3rd deferred
2nd deferred
1st deferred
```

```cit
fn process(ok) {
    defer println("clean up")        # runs on early return too
    if (!ok) {
        return "stopped early"
    }
    println("working...")
    return "finished"
}
println(process(false))
println(process(true))
```

Output:

```text
clean up
stopped early
working...
clean up
finished
```

```cit
fn counter() {
    let mut n = 1
    defer { println($"n ended as {n}") }
    n = 42
}
counter()
```

Output:

```text
n ended as 42
```

```cit
defer println("Goodbye!")
println("Hello!")
```

Output:

```text
Hello!
Goodbye!
```

`defer` accepts calls, assignments, blocks and similar statements; `defer return ...` or `defer let ...` are errors.

## Try it yourself

1. Write `isEven(n)` that returns `true` or `false`.
2. Write `average(a, b, c = 0)`.
3. Use `map` with a lambda to turn `["a", "b"]` into `["A", "B"]`.
4. Write a function that prints `"Start"`, defers `"End"`, and prints something in between.

Previous: [8. Dictionaries](08-dictionaries.md) | Next: [10. Classes](10-classes.md)
