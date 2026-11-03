# 11. Errors and safety

Programs go wrong sometimes: a file name is mistyped, a user types letters where a number belongs. CIT helps you understand errors and gives you tools to handle them.

## Reading an error message

```text
[CIT Error] Line 3, column 9: Undefined variable 'scor'.
```

It tells you **where** (line and column) and **what** went wrong. In VS Code the same place also gets a red squiggle.

There are two kinds of errors:

| Kind | When it appears | Example |
| --- | --- | --- |
| **Compile error** | Before anything runs. Your code is not valid CIT. | a missing `)`, `let` without a name |
| **Runtime error** | While the program runs. The code is valid but something impossible happened. | dividing by zero, a missing key |

A compile error means **nothing** ran. A runtime error stops the program at that line, but everything printed before it is still there:

```cit
println("This line runs")
println("This one too")
println(10 / 0)
println("But never this one")
```

Result:

```text
This line runs
This one too
[CIT Error] Line 3, column 12: Division by zero.
```

## The errors you will meet most

| Message | Meaning and fix |
| --- | --- |
| `Undefined variable 'x'.` | The name does not exist (typo? declared later? declared inside another block?) |
| `Cannot reassign immutable variable 'x'. Use 'let mut'.` | You changed a plain `let` variable. Declare it with `let mut`. |
| `Type mismatch: expected int, received str.` | A variable that holds one type got another. |
| `Division by zero.` | Dividing by `0` with `/`, `//` or `%`. |
| `Index 5 is out of range for a list of length 2.` | That list position does not exist. |
| `Key "email" was not found in the dictionary.` | Use `in` or `d.get(key)` first. |
| `Cannot change list 'x' because it was declared with 'let'.` | Lists and dictionaries need `let mut` to be changed. |
| `Invalid operands for '+' (str and int).` | You mixed types, e.g. text plus a number. |
| `Cannot call 'talk' because the value is null.` | The object is `null`. Use `?.`. |
| `Missing argument 'b'.` | A function call left out a required value. |

```cit
let scores = [10, 20]
println(scores[2])
```

Result:

```text
[CIT Error] Line 2, column 15: Index 2 is out of range for a list of length 2.
```

```cit
let player = null
player.jump()
```

Result:

```text
[CIT Error] Line 2, column 8: Cannot call 'jump' because the value is null. Use ?. for a safe call (value?.jump()).
```

## `try` and `catch`: handling errors

Wrap risky code in `try { }`. If an error happens inside, CIT jumps to the `catch` block instead of stopping the program.

```cit
let mut info = {name: "Adam", age: 23}

try {
    println(info[email])
} catch (err) {
    warnln($"Found a bug: {err}")
}
```

Output:

```text
[WARNING] Found a bug: Key "email" was not found in the dictionary. Use d.get(key) to avoid this error.
```

- Code in `try` runs until the first error. The rest of the `try` block is skipped.
- `catch (err)` receives the error message as `err`. You can pick any name.
- If nothing goes wrong, `catch` is skipped.
- The program continues after the `catch` block.

```cit
try {
    println("step 1")
    println(10 / 0)
    println("step 3 is never reached")
} catch (e) {
    println("Caught:", e)
}
println("the program goes on")
```

Output:

```text
step 1
Caught: Division by zero.
the program goes on
```

You can leave out the name when you do not need the message: `catch { ... }`.

### `throw`: raising your own errors

`throw` raises an error from your own code. Anything can be thrown; `catch` receives exactly that value.

```cit
fn withdraw(balance, amount) {
    if (amount > balance) {
        throw "Not enough money"
    }
    return balance - amount
}

try {
    println(withdraw(100, 30))
    println(withdraw(100, 500))
} catch (reason) {
    println("Failed:", reason)
}
```

Output:

```text
70
Failed: Not enough money
```

```cit
try {
    throw {code: 404, message: "Not found"}
} catch (problem) {
    println(problem[code], problem[message])
}
```

Output:

```text
404 Not found
```

An error that nobody catches stops the program and is shown like any other error:

```cit
throw "Something bad happened"
```

Result:

```text
[CIT Error] Line 1, column 1: Something bad happened
```

### Typed errors and `finally`

Use `raise` to identify an error type. An `except` handler catches only its named type; a general `catch` still handles any error. A `finally` block always runs:

```cit
try {
    raise ValueError("Invalid input")
} except ValueError as err {
    println(err)
} finally {
    println("Cleanup")
}
```

Output:

```text
Invalid input
Cleanup
```

### Nesting, rethrowing, and control flow

```cit
try {
    try {
        throw "inner problem"
    } catch (e) {
        println("inner caught:", e)
        throw $"{e} (rethrown)"
    }
} catch (e2) {
    println("outer caught:", e2)
}
```

Output:

```text
inner caught: inner problem
outer caught: inner problem (rethrown)
```

`return`, `break` and `continue` work normally inside `try` and `catch`:

```cit
fn firstNumber(items) {
    for (let item in items) {
        try {
            return castInt(item)
        } catch (e) {
            println("skipping", item)
        }
    }
    return null
}
println(firstNumber(["x", "y", "42", "7"]))
```

Output:

```text
skipping x
skipping y
42
```

### What `try` cannot catch

Two situations are never caught, on purpose: pressing `Ctrl+C` to stop the program, and the safety stop for endless loops. Otherwise a `catch` could hide a runaway program.

## Safe navigation: `?.`

Calling a method on `null` is an error. Write `?.` instead of `.` to say "only if it is not null":

```cit
let mut player = null
player?.jump()                 # nothing happens
println(player?.name)          # null
println("still running")
```

Output:

```text
null
still running
```

```cit
class person() {
    fn struct(name) {
        self.name = name
    }
    fn talk() {
        println($"Hi, I am {self.name}")
    }
}

let mut p = null
p?.talk()
p = person("Ada")
p?.talk()
println(p?.name)
```

Output:

```text
Hi, I am Ada
Ada
```

- If the value before `?.` is `null`, the **whole chain** is skipped and the result is `null`: `a?.b.c()` does nothing when `a` is null.
- The arguments of a skipped call are not evaluated.
- It works with methods of text, lists and dictionaries too: `name?.upper()`.
- `?.` cannot be used on the left of an `=`.

## Fallback values for conversions

`castInt`, `castFloat` and `castBool` can be given a **fallback**, used when the conversion is impossible:

```cit
let number = castInt(input("How old are you: "), fallback = 0)
println(number)
```

Output:

```text
How old are you: abc
0
```

```cit
let number = castInt(input("How old are you: "), fallback = 0)
println(number)
```

Output:

```text
How old are you: 25
25
```

Without a fallback, a failed conversion is an error you can `catch`:

```cit
try {
    println(castInt("banana"))
} catch (e) {
    println(e)
}
```

Output:

```text
castInt(): cannot convert "banana" (str) to an int. Use fallback = value to avoid this error.
```

## Ways to avoid errors before they happen

| Situation | Safe tool |
| --- | --- |
| Is this dictionary key there? | `"key" in dict`, or `dict.get("key", fallback)` |
| Is this value in the list? | `x in list` |
| Might the object be `null`? | `obj?.method()` |
| Might the text not be a number? | `castInt(text, fallback = 0)` |
| Might the list be empty? | check `len(list) > 0` first |
| Something may fail and I need to clean up | `try` / `catch`, and `defer` ([chapter 9](09-functions.md)) |

## Try it yourself

1. Ask for two numbers and divide them. Use `try` / `catch` to print `"Cannot divide by zero"`.
2. Write a function that `throw`s when its argument is negative, and call it inside `try`.
3. Make a list of names where one is `null`, and call `?.upper()` on each.

Previous: [10. Classes](10-classes.md) | Next: [12. Built-in functions](12-built-in-functions.md)
