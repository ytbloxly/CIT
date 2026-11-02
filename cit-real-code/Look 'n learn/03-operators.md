# 3. Operators

Operators combine values into new values.

## Math

| Operator | Meaning | Example | Result |
| --- | --- | --- | --- |
| `+` | add | `7 + 2` | `9` |
| `-` | subtract | `7 - 2` | `5` |
| `*` | multiply | `7 * 2` | `14` |
| `/` | divide | `7 / 2` | `3.5` |
| `//` | divide and round **down** | `7 // 2` | `3` |
| `%` | remainder | `7 % 2` | `1` |
| `**` | power | `2 ** 3` | `8` |

```cit
println(7 + 2, 7 - 2, 7 * 2, 7 / 2, 7 // 2, 7 % 2, 2 ** 3)
```

Output:

```text
9 5 14 3.5 3 1 8
```

Some details worth knowing:

```cit
println(-7 // 2)       # rounds down, towards the smaller number
println(-7 % 3)        # the remainder is never negative here
println(2 ** 3 ** 2)   # ** works right to left: 2 ** (3 ** 2)
println(0.1 + 0.2)     # decimals are not always exact in computers
```

Output:

```text
-4
2
512
0.30000000000000004
```

Dividing by zero is an error:

```cit
println(10 / 0)
```

Result:

```text
[CIT Error] Line 1, column 12: Division by zero.
```

`+` also joins text and joins lists. It does **not** mix text and numbers; use a template string ([chapter 4](04-strings.md)) or `castString`:

```cit
println("Hello, " + "CIT")
println([1, 2] + [3])
println("Score: " + castString(10))
```

Output:

```text
Hello, CIT
[1, 2, 3]
Score: 10
```

```cit
println("Score: " + 10)
```

Result:

```text
[CIT Error] Line 1, column 19: Invalid operands for '+' (str and int).
```

## Comparing

Comparisons give `true` or `false`.

| Operator | Meaning |
| --- | --- |
| `==` | equal |
| `!=` | not equal |
| `<` `>` | smaller, bigger |
| `<=` `>=` | smaller or equal, bigger or equal |

```cit
println(3 == 3, 3 != 3, 3 < 5, 3 >= 5)
println("a" < "b")                # text is compared alphabetically
println([1, 2] == [1, 2])         # lists are compared item by item
println({a: 1} == {a: 1})         # so are dictionaries
println(1 == "1")                 # different types are never equal
```

Output:

```text
true false true false
true
true
true
false
```

## Logic: `&&`, `||`, `!`

| Operator | Meaning |
| --- | --- |
| `a && b` | true when **both** are true |
| `a \|\| b` | true when **at least one** is true |
| `!a` | the opposite |

```cit
let age = 20
let hasTicket = true
println(age >= 18 && hasTicket)
println(age < 13 || age > 65)
println(!hasTicket)
```

Output:

```text
true
false
false
```

They stop early: in `a && b`, if `a` is false then `b` is never looked at. That makes checks like this safe:

```cit
let items = []
if (len(items) > 0 && items[0] == "x") {
    println("first item is x")
} else {
    println("nothing to check")
}
```

Output:

```text
nothing to check
```

> **Note:** CIT does not have the words `and`, `or` and `not`. Use `&&`, `||` and `!`. If you write the words by mistake, the compiler tells you what to use instead.

## The `in` operator

`x in y` asks "is `x` inside `y`?". It works with text, lists and dictionaries:

| `y` is a... | `x in y` is true when... |
| --- | --- |
| string | the text `x` appears inside `y` |
| list | `x` is one of the items |
| dictionary | `x` is one of the **keys** |

```cit
str string = "Hello, CIT!"

if ("CIT!" in string) {
    println($"We found CIT! in {string}")
}
println(3 in [1, 2, 3], 9 in [1, 2, 3])
println("name" in {name: "Ada", age: 36})
```

Output:

```text
We found CIT! in Hello, CIT!
true false
true
```

To ask the opposite, put `!` in front of the whole thing: `!("x" in text)`.

## Changing a variable: `=` and shortcuts

`=` puts a new value into a `let mut` variable. The shortcuts do the math and the assignment in one step:

| Shortcut | Same as |
| --- | --- |
| `x += 5` | `x = x + 5` |
| `x -= 5` | `x = x - 5` |
| `x *= 5` | `x = x * 5` |
| `x /= 5` | `x = x / 5` |
| `x %= 5` | `x = x % 5` |
| `x **= 5` | `x = x ** 5` |
| `x //= 5` | `x = x // 5` |

```cit
let mut x = 10
x += 5
println(x)
x -= 3
println(x)
x *= 2
println(x)
x /= 4
println(x)
x **= 2
println(x)
x %= 7
println(x)
x //= 1
println(x)
```

Output:

```text
15
12
24
6
36
1
1
```

They work on text and lists too (`name += "!"`), and on list items, dictionary items and properties (`scores[0] += 1`).

## `++` and `--`

Add or subtract one. Written **after** the name (`n++`) it gives back the old value; written **before** (`++n`) it gives back the new one.

```cit
let mut n = 5
n++
println(n)
++n
println(n)
println(n++, n)    # prints the old value, then the new one
println(++n, n)    # the new value both times
n--
--n
println(n)
```

Output:

```text
6
7
7 8
9 9
7
```

## Which comes first? (precedence)

When an expression has several operators, the ones higher in this list happen first. Use parentheses whenever you want to be sure.

| Order | Operators |
| --- | --- |
| 1 | calls `f()`, index `a[0]`, `.`, `?.`, postfix `n++` `n--` |
| 2 | prefix `!` `-` `+` `++` `--` |
| 3 | `**` |
| 4 | `*` `/` `//` `%` |
| 5 | `+` `-` |
| 6 | `<` `>` `<=` `>=` `in` |
| 7 | `==` `!=` |
| 8 | `&&` |
| 9 | `\|\|` |

```cit
println(2 + 3 * 4)
println((2 + 3) * 4)
println(1 + 1 in [2, 3])
println(5 > 3 && 2 > 1 || false)
println(-2 ** 2)       # the minus is applied first: (-2) ** 2
```

Output:

```text
14
20
true
true
4
```

## Try it yourself

1. Print the remainder of `17 / 5`.
2. Check with `in` whether `"a"` is inside `"banana"`.
3. Start with `let mut coins = 100`, then use shortcuts to spend 30 and double what is left.

Previous: [2. Variables and types](02-variables-and-types.md) | Next: [4. Strings](04-strings.md)
