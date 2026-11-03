# 16. Tuples, sets and math

CIT lists, dictionaries, sets and tuples can hold values of different types.

## Sets

A set stores each value once. Set literals use braces without key/value colons:

```cit
let mut values = {1, 2, 2, 3, 1}
println(values)
println(2 in values)
```

Output:

```text
{1, 2, 3}
true
```

Use `set(...)` or `frozenset(...)` to create a set from arguments. A frozenset cannot be changed through dictionary-style assignment.

## Tuples

Tuples keep their order and cannot be changed:

```cit
let point = (4, "north", true)
println(point)
println(point[0])
```

Output:

```text
(4, "north", true)
4
```

`tuple(1, 2)` creates the same kind of value. A one-item tuple can be written `(1,)`.

## Collection constructors

```cit
let numbers = list(1, 2, 3)
let point = tuple(1, "two")
let unique = set(1, 1, 2)
let info = dict(name: "Ada", age: 23)
let fixed = frozendict(name: "Grace")
```

`list`, `tuple`, `set`, `dict` and `frozendict` accept values of mixed types. In a dictionary constructor, use named keys or pass key/value pairs.

## `math`

```cit
import math
println(math.ceil(3.1), math.floor(3.9), math.trunc(3.9))
println(math.sqrt(16), math.cbrt(27), math.exp(1))
println(math.log(100, 10), math.log2(8))
println(math.sin(math.pi / 2), math.cos(0), math.tan(0))
println(math.degrees(math.pi), math.radians(180))
println(math.factorial(5), math.gcd(12, 18), math.lcm(12, 18))
```

The module also provides `e`, `pi`, `tau`, `nan` and `inf`.

## Try it yourself

1. Make a set containing a string and a number.
2. Read the second item of a tuple.
3. Use `math.sqrt()` and `math.pi` in one expression.

Previous: [15. Cheat sheet](15-cheat-sheet.md) | Next: [17. Functions and built-ins](17-functions-and-builtins.md)
