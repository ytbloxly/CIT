# 12. Built-in functions

These functions are always available. You do not import anything.

| Function | Short description |
| --- | --- |
| [`println`](#println-warnln-errorln) `warnln` `errorln` | print a line |
| [`input`](#input) | read text typed by the user |
| [`castInt`](#castint-castfloat) `castFloat` | convert to a number |
| [`castString`](#caststring) | convert to text |
| [`castBool`](#castbool) | convert to true / false |
| [`range`](#range) | list of numbers |
| [`min`](#min-and-max) `max` | smallest / biggest |
| [`sum`](#sum) | add numbers up |
| [`len`](#len) | length of text, a list or a dictionary |
| [`random`](#random) | random decimal number |
| [`randint`](#randint) | random whole number |
| `printf` | formatted output |
| `list` `tuple` `set` `dict` `frozendict` `frozenset` | collection constructors |
| `zip` `enumerate` | pair items from iterables |
| `type` `isinstance` `issubclass` | inspect types and classes |
| `bin` `round` `id` `square` | utility functions |
| `exchange` | assign a new value and return the old value |
| `task.wait` | pause execution |
| `open` | read or write UTF-8 text files |

If you create your own variable or function with the same name, yours is used instead.

## println, warnln, errorln

Print values on one line, separated by spaces. `println` is normal, `warnln` is **yellow** and starts with `[WARNING]`, `errorln` is **red** and starts with `[ERROR]`. With no values they print an empty line.

```cit
println("a", 1, true, [1, 2], {k: "v"}, null)
warnln("careful")
errorln("broken")
println()
println("after the empty line")
```

Output:

```text
a 1 true [1, 2] {k: "v"} null
[WARNING] careful
[ERROR] broken

after the empty line
```

They are special statements: call them directly, as in `println(x)`.

## input

`input(question)` prints the question, waits for the user to type a line and press Enter, and gives back that line as **text**. The question is optional.

```cit
let name = input("Name? ")
let luckyText = input("Lucky number? ")
println($"{name} likes {luckyText}")
println(luckyText + 1 == 8)
```

Result:

```text
Name? Ada
Lucky number? 7
Ada likes 7
[CIT Error] Line 4, column 19: Invalid operands for '+' (str and int).
```

Oops: that last line is an error, because `luckyText` is text. Convert first:

```cit
let lucky = castInt(input("Lucky number? "))
println(lucky + 1)
```

Output:

```text
Lucky number? 7
8
```

## castInt, castFloat

Convert a value to a whole number or a decimal number.

| Given | `castInt` | `castFloat` |
| --- | --- | --- |
| `"42"` | `42` | `42` |
| `" 7 "` (spaces are ignored) | `7` | `7` |
| `"3.9"` | `3` (cuts off the decimals) | `3.9` |
| `2.7` | `2` | `2.7` |
| `true` / `false` | `1` / `0` | `1` / `0` |
| `"abc"`, `""`, `null`, a list | **error** | **error** |

```cit
println(castInt("42"), castInt("3.9"), castInt(2.7), castInt(true))
println(castFloat("2.5"), castFloat("7"))
```

Output:

```text
42 3 2 1
2.5 7
```

When a conversion is impossible you get an error, unless you pass a **fallback**:

```cit
println(castInt("abc", fallback = 0))
println(castInt("abc", fallback: -1))      # name: value works too
println(castFloat("1.5.2", fallback = 1.0))
println(castInt("abc", fallback = null))
```

Output:

```text
0
-1
1
null
```

```cit
println(castInt("abc"))
```

Result:

```text
[CIT Error] Line 1, column 9: castInt(): cannot convert "abc" (str) to an int. Use fallback = value to avoid this error.
```

Only plain decimal text is accepted. Things like `"1e5"` or `"0x10"` are not numbers for these functions.

## castString

Turns any value into text, the same way `println` would show it.

```cit
println(castString(42) + "!", castString(true), castString([1, 2]), castString(null))
println("Score: " + castString(10))
```

Output:

```text
42! true [1, 2] null
Score: 10
```

## castBool

Turns a value into `true` or `false`.

| Given | Result |
| --- | --- |
| `true` / `false` | itself |
| `"true"` `"yes"` `"on"` `"1"` (any case) | `true` |
| `"false"` `"no"` `"off"` `"0"` `""` | `false` |
| other text, e.g. `"maybe"` | `true`, or the `fallback` if you give one |
| numbers | `false` for `0`, otherwise `true` |
| `null`, `[]`, `{}` | `false` |
| other lists / dictionaries | `true` |

```cit
println(castBool("yes"), castBool("no"), castBool(0), castBool(3), castBool([]))
println(castBool("maybe"), castBool("maybe", fallback = false))
```

Output:

```text
true false false true false
true false
```

## range

`range(stop)`, `range(start, stop)` or `range(start, stop, step)` gives a list of whole numbers. The `stop` number is **not** included.

```cit
println(range(5))
println(range(2, 6))
println(range(0, 10, 3))
println(range(5, 0, -2))
println(range(3, 3))
```

Output:

```text
[0, 1, 2, 3, 4]
[2, 3, 4, 5]
[0, 3, 6, 9]
[5, 3, 1]
[]
```

The step cannot be `0`, and all the values must be whole numbers. A single `range` can hold up to 1,000,000 numbers.

```cit
println(range(1.5))
```

Result:

```text
[CIT Error] Line 1, column 9: range() values must be integers.
```

`range` is also how `for` loops count: `for (let i, range(0, 10, 2))` ([chapter 6](06-loops.md)).

## min and max

The smallest or biggest of some values, or of a list. All values must be numbers, or all must be text.

```cit
println(min(4, 2, 8), max(4, 2, 8))
println(min([5, 3, 9]), max([5, 3, 9]))
println(min("pear", "apple"), max("pear", "apple"))
```

Output:

```text
2 8
3 9
apple pear
```

```cit
println(min([]))
```

Result:

```text
[CIT Error] Line 1, column 9: min() needs at least one value.
```

## sum

Adds numbers. Give it a list or several numbers. The sum of an empty list is `0`.

```cit
println(sum([1, 2, 3]), sum(1, 2, 3), sum([]), sum([0.5, 0.25]))
println(sum(range(1, 101)))
```

Output:

```text
6 6 0 0.75
5050
```

## len

The number of characters in a text, items in a list, or keys in a dictionary.

```cit
println(len("héllo"), len([1, 2, 3]), len({a: 1, b: 2}))
println(len(""), len([]), len({}))
```

Output:

```text
5 3 2
0 0 0
```

```cit
println(len(42))
```

Result:

```text
[CIT Error] Line 1, column 9: len() takes one list, string or dictionary.
```

## random

`random(min, max)` gives a random **decimal** number from `min` to `max`. With one number it starts at `0`; with none it gives a number from `0` to `1`.

```cit
println(random())
println(random(10))
println(random(1, 100))
```

Example output (yours will be different every time):

```text
0.6933655784296497
8.437537505530797
61.32434782683152
```

Numbers have a method `toFixed(digits)` that rounds to a number of digits after the decimal point. It gives back a number: `8.2222` becomes `8.22`.

```cit
let secret_number = random(1, 100).toFixed(2)
println(secret_number)
```

Example output (yours will be different every time):

```text
9.18
```

```cit
println(8.2222.toFixed(2), 8.2288.toFixed(2), 3.14159.toFixed(3), 2.5.toFixed(0))
let price = 19.987
println(price.toFixed(1))
```

Output:

```text
8.22 8.23 3.142 3
20
```

`toFixed` takes 0 to 20 digits (the default is 0). Because the result is a number, trailing zeros are not shown: `8.50.toFixed(2)` prints `8.5`.

## randint

`randint(min, max)` gives a random **whole** number from `min` to `max`, and both ends can appear. With one number it starts at `0`.

```cit
let secret_number2 = randint(1, 100)
println(secret_number2)
println(randint(1, 6))      # a dice roll
println(randint(10))        # 0 to 10
```

Example output (yours will be different every time):

```text
21
6
2
```

Both functions give an error when the first number is larger than the second:

```cit
println(randint(10, 1))
```

Result:

```text
[CIT Error] Line 1, column 9: randint(): the first number must not be larger than the second.
```

## Try it yourself

1. Roll two dice with `randint(1, 6)` and print the total.
2. Ask for a number with `castInt(..., fallback = 0)` and print its double.
3. Print the longest of three words using `max` and `len`.

Previous: [11. Errors and safety](11-errors-and-safety.md) | Next: [13. Modules and ipcit](13-modules-and-ipcit.md)
