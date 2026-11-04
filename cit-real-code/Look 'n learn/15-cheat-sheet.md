# 15. Cheat sheet

Everything in CIT on one page. Follow the chapter links for details.

## Words that have a special meaning

`let` `mut` `fn` `class` `if` `elseif` `else` `switch` `case` `default` `while` `do` `for` `in` `range` `break` `continue` `pass` `return` `try` `catch` `except` `finally` `throw` `raise` `defer` `import` `as` `with` `enum` `private` `protected` `true` `false` `null` `self` `super`

Types for typed variables: `int` `float` `str` `char` `bool`.

## Basics ([1](01-getting-started.md), [2](02-variables-and-types.md))

```cit
# comment            /* block comment */
println("a", 1)      warnln("yellow")      errorln("red")
let x = 1            # cannot change
let mut y = 2        # can change
let mut empty        # empty variable (must be mut)
let a, b, c = 1, 2, 3
int n = 5   float f = 1.5   str s = "t"   char c = 'x'   bool ok = true
```

## Operators ([3](03-operators.md))

| | |
| --- | --- |
| math | `+ - * / // % **` |
| compare | `== != < > <= >=` |
| logic | `&& \|\| !` |
| membership | `x in text`, `x in list`, `key in dict` |
| assign | `= += -= *= /= %= **= //=` |
| count | `n++ ++n n-- --n` |
| safe call | `obj?.method()` |

## Strings ([4](04-strings.md))

```cit
"text"   'c'   $"Hi {name}"   "line\nbreak"
let menu = """
multi-line
"""
s[0]  s[-1]  len(s)  "a" in s
```

Methods: `include` `starts` `ends` `indexOf` `slice` `substring` `at` `charAt` `charCodeAt` `split` `lower` `upper` `trim` `replace` `replaceAll` `startPad` `endPad` `repeat`

## Decisions and loops ([5](05-conditions.md), [6](06-loops.md))

```cit
if (a) { } elseif (b) { } else { }

switch (v) {
    case 1, 2 { }
    case default { }
}

while (cond) { }
do { } while (cond)
for (let i, range(0, 10)) { }
for (let mut i, range(0, 10, 2)) { }
for (let item in collection) { }
break   continue   pass
```

## Lists ([7](07-lists.md))

```cit
let mut nums = [1, 2, 3]       nums[0]   nums[-1]   nums[0] = 9
```

Methods: `append` `insert` `unshift` `pop` `shift` `remove` `splice` `clear` `reverse` `count` `index` `include` `copy` `slice` `map` `filter` `reduce` `find`

## Dictionaries ([8](08-dictionaries.md))

```cit
let mut d = {name: "Ada", age: 36}      d["name"]   d[name]   d["x"] = 1
```

Methods: `get` `keys` `values` `items` `copy` `fromkeys` `update` `pop` `popitem` `default` `clear`

## Functions ([9](09-functions.md))

```cit
fn add(a, b = 1) { return a + b }
add(1)   add(1, 2)   add(1, b: 5)   add(1, b = 5)
let f = add                           # the function itself
let inc = x => x + 1
let mul = (a, b) => a * b
let sq = fn sq(x) { return x * x }
fn work() { defer println("last")   println("first") }
```

## Classes ([10](10-classes.md))

```cit
class person() {
    fn struct(name) { self.name = name }
    fn talk() { println(self.name) }
}
class builder(person()) {
    fn struct(name, company) {
        super().struct(name)
        self.company = company
    }
}
let b = builder("Bob", "ACME")
```

## Errors ([11](11-errors-and-safety.md))

```cit
try { risky() } catch (err) { println(err) }
throw "message"
obj?.method()
castInt(text, fallback = 0)
```

## Built-in functions ([12](12-built-in-functions.md))

| Function | Gives |
| --- | --- |
| `input(q)` | typed text |
| `castInt(x)` `castFloat(x)` `castString(x)` `castBool(x)` | converted value (`fallback = v` is optional) |
| `range(stop)` `range(a, b)` `range(a, b, step)` | list of numbers |
| `min(...)` `max(...)` `sum(...)` | smallest, biggest, total |
| `len(x)` | length of text, list or dictionary |
| `random(a, b)` | random decimal |
| `randint(a, b)` | random whole number |
| `number.toFixed(n)` | rounded number |
| `list()` `tuple()` `set()` `dict()` | construct a collection |
| `frozendict()` `frozenset()` | construct a read-only collection |
| `bin(n)` `square(n)` `round(n)` | binary text, square, rounded number |
| `zip(...)` `enumerate(...)` | pair items from iterables |
| `type(x)` `isinstance(x, "int")` `issubclass(a, b)` | inspect types and classes |
| `printf(format, ...)` `exchange(variable, value)` | formatted print and swap value |
| `task.wait(seconds)` | pause the program |

## Additional features ([16–20](16-collections-and-math.md))

```cit
let mut values = {1, 2, 2, 3}
let point = (1, "north")
let mut recent <2s> = "short-lived"
let mut rangeValue <30l> = 3
let even = "Even" if (n % 2 == 0) else "Odd"
import math
println(math.sqrt(16), math.pi)
```

Classes also support `private` / `protected` fields, overloaded binary operators and `@decorator` functions. `raise`, typed `except` clauses and `finally` are available. See chapters 16–20 for collections, math, terminal tools, UTF-8 file I/O, enums and `cit --open trm`.

## Modules ([13](13-modules-and-ipcit.md))

```cit
import "./lib/tools" as tools
import "package-name"
import math
import { math, ui, ... }
```

## Removed

`and`, `or`, `not` (use `&&`, `||`, `!`) and `for (let i, range = 0, 10)` (use `for (let i, range(0, 10))`).

Previous: [14. Tools and editor](14-tools-and-editor.md) | Next: [16. Tuples, sets and math](16-collections-and-math.md) | Back to the [index](README.md)
