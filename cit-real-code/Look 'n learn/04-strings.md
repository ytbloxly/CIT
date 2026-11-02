# 4. Strings

A **string** is text. In this guide the words *string* and *text* mean the same thing.

## Writing strings

```cit
println("double quotes")
println('x')                       # single quotes hold exactly ONE character (type char)
println("She said \"hi\"")         # \" puts a quote inside the text
```

Output:

```text
double quotes
x
She said "hi"
```

Special characters are written with a backslash:

| Write | You get |
| --- | --- |
| `\n` | a new line |
| `\t` | a tab |
| `\"` | a double quote |
| `\'` | a single quote |
| `\\` | a backslash |

```cit
println("line one\nline two")
println("name:\tAda")
println("C:\\Users\\Ada")
```

Output:

```text
line one
line two
name:	Ada
C:\Users\Ada
```

## Putting values into text: template strings

Put a `$` before the opening quote and write any expression between `{` and `}`:

```cit
let name = "Ada"
let age = 36
println($"{name} is {age} years old")
println($"Next year: {age + 1}")
println($"Shouting: {name.upper()}")
```

Output:

```text
Ada is 36 years old
Next year: 37
Shouting: ADA
```

Inside the braces you can use variables, math, method calls, list items (`{nums[0]}`) and dictionary items (`{info[name]}`).

> If your text needs a literal `{` or `}`, use a normal string with `+` instead of a template.

## Multi-line strings

Three double quotes start and end a string that spans many lines:

```cit
let menu = """
1. Start
2. Settings
3. Exit
"""
println(menu)
```

Output:

```text
1. Start
2. Settings
3. Exit
```

The rules are simple:

- The line break right after the opening `"""` is **not** part of the text.
- If the closing `"""` is alone on its line, that last line break is dropped as well, and the closing line's indentation is removed from every line. This lets you indent a multi-line string inside a function and still get clean text.
- Escapes such as `\t` work, and you can use `"` freely inside.
- Put a `$` in front (`$"""`) to use `{expressions}` inside.

```cit
fn banner(title) {
    return $"""
        ==========
        {title.upper()}
        ==========
        """
}
println(banner("welcome"))
```

Output:

```text
==========
WELCOME
==========
```

## Joining, measuring, picking

```cit
let a = "Hello"
let b = "CIT"
println(a + ", " + b + "!")
println(len(a))                    # number of characters
println(a[0], a[-1])               # first and last character
println("ab" == "ab", "ab" < "b")
println("ell" in a)                # is it inside?
```

Output:

```text
Hello, CIT!
5
H o
true true
true
```

Letters are counted as characters, not bytes, so accents and emoji count as one:

```cit
println(len("héllo"), len("😀"))
```

Output:

```text
5 1
```

You can loop over the characters:

```cit
for (let ch in "CIT") {
    println(ch)
}
```

Output:

```text
C
I
T
```

Strings **never change**. Every method below gives back a new string.

## String methods

All the methods are called with a dot: `text.upper()`.

| Method | What it does |
| --- | --- |
| `include(x)` | is `x` inside? (`true` / `false`) |
| `starts(x)` | does the text begin with `x`? |
| `ends(x)` | does the text end with `x`? |
| `indexOf(x)` | position of `x`, or `-1` if missing |
| `slice(start, end)` | part of the text (negative numbers count from the end) |
| `substring(start, end)` | part of the text (never negative) |
| `at(i)` | character at `i`, negatives allowed, `null` if outside |
| `charAt(i)` | character at `i`, `""` if outside |
| `charCodeAt(i)` | character code (a number) |
| `split(sep)` | break into a list |
| `lower()` | lowercase |
| `upper()` | uppercase |
| `trim()` | remove spaces at both ends |
| `replace(a, b)` | replace the **first** `a` with `b` |
| `replaceAll(a, b)` | replace **every** `a` with `b` |
| `startPad(n, fill)` | pad at the start until the length is `n` |
| `endPad(n, fill)` | pad at the end until the length is `n` |
| `repeat(n)` | repeat `n` times |

### Searching

```cit
let s = "Hello, CIT!"
println(s.include("CIT"), s.include("cit"))
println(s.starts("Hell"), s.ends("!"))
println(s.indexOf("l"), s.indexOf("l", 4), s.indexOf("zzz"))
```

Output:

```text
true false
true true
2 -1 -1
```

`indexOf(x, from)` can start searching at position `from`.

### Cutting pieces

```cit
let s = "Hello, CIT!"
println(s.slice(0, 5))        # Hello
println(s.slice(-4))          # CIT!
println(s.slice(7))           # CIT!
println(s.slice(0, -1))       # everything but the last character
println(s.substring(7, 10))   # CIT
println(s.substring(10, 7))   # the order of the numbers does not matter
```

Output:

```text
Hello
CIT!
CIT!
Hello, CIT
CIT
CIT
```

`slice` counts negative numbers from the end. `substring` treats negative numbers as `0`.

### Single characters

```cit
let s = "héy"
println(s.at(0), s.at(-1), s.at(9))
println(s.charAt(1), "[" + s.charAt(9) + "]")
println("A".charCodeAt(0), "a".charCodeAt(0), "A".charCodeAt(5))
```

Output:

```text
h y null
é []
65 97 null
```

`at(9)` gives `null` and `charAt(9)` gives empty text when the position does not exist.

### Splitting and changing

```cit
println("a,b,c".split(","))
println("  many   spaces here ".split())   # no separator: split on whitespace
println("abc".split(""))                   # one item per character
println("Hello".lower(), "Hello".upper(), "[" + "  x  ".trim() + "]")
println("a-b-c".replace("-", "+"))         # only the first one
println("a-b-c".replaceAll("-", "+"))      # every one
```

Output:

```text
["a", "b", "c"]
["many", "spaces", "here"]
["a", "b", "c"]
hello HELLO [x]
a+b-c
a+b+c
```

### Padding and repeating

```cit
println("7".startPad(3, "0"))        # 007
println("7".endPad(3, "*"))          # 7**
println("ab".startPad(5))            # spaces by default
println("-".repeat(10))
```

Output:

```text
007
7**
   ab
----------
```

Padding is handy for tables:

```cit
let items = ["tea", "coffee", "milk"]
let prices = [2, 5, 3]
for (let i, range(0, 3)) {
    println(items[i].endPad(8, ".") + castString(prices[i]).startPad(3))
}
```

Output:

```text
tea.....  2
coffee..  5
milk....  3
```

### Chaining

Methods can be chained, left to right:

```cit
println("  Hello World  ".trim().lower().replace("world", "cit").split(" "))
```

Output:

```text
["hello", "cit"]
```

## Common mistakes

```cit
println("a".include(5))
```

Result:

```text
[CIT Error] Line 1, column 13: include() value must be a string.
```

```cit
println("abc".shout())
```

Result:

```text
[CIT Error] Line 1, column 15: Strings have no method 'shout'.
```

## Try it yourself

1. Ask for a sentence and print it in capital letters.
2. Count how many times the letter `"a"` appears in `"banana"` (hint: `split("a")` gives a list).
3. Build a line of 20 `=` characters with `repeat`.

Previous: [3. Operators](03-operators.md) | Next: [5. Conditions](05-conditions.md)
