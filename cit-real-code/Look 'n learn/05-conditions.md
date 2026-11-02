# 5. Conditions

Conditions let your program choose what to do.

## `if`, `elseif`, `else`

```cit
let temperature = 25

if (temperature > 30) {
    println("It is hot")
} elseif (temperature > 15) {
    println("It is nice")
} else {
    println("It is cold")
}
```

Output:

```text
It is nice
```

- The condition goes in `( )`, and the code in `{ }`. Both are required.
- `elseif` and `else` are optional. You can have as many `elseif` as you like.
- Only the **first** branch whose condition is true runs.
- Any value can be a condition (see *truthy and falsy* in [chapter 2](02-variables-and-types.md)).

```cit
let name = ""
if (name) {
    println($"Hello, {name}")
} else {
    println("Please tell me your name")
}
```

Output:

```text
Please tell me your name
```

Combine conditions with `&&`, `||` and `!`, and nest `if` statements when needed:

```cit
let age = 17
let hasParent = true

if (age >= 18 || (age >= 12 && hasParent)) {
    println("You can enter")
}

if (age >= 16) {
    if (hasParent) {
        println("Welcome with a parent")
    }
}
```

Output:

```text
You can enter
Welcome with a parent
```

## `switch` / `case`

When you compare **one value** against many options, `switch` is tidier than a long `elseif` chain.

```cit
let userTier = "premium"

switch (userTier) {
  case "free" {
    println("Access to standard content with ads.")
    break
  }

  case "premium" {
    println("Access to high-quality content, no ads.")
    break
  }

  case "vip" {
    println("Access to all content, live events, and premium support.")
    break
  }

  case default {
    println("Unknown subscription tier. Please log in.")
  }
}
```

Output:

```text
Access to high-quality content, no ads.
```

How `switch` works:

- The value in `switch (...)` is compared with each `case` using `==`, from top to bottom.
- The **first** matching case runs, and then the switch is finished. There is **no fall-through**: you never need `break` to stop the next case from running. (`break` is still allowed; it simply ends the switch early.)
- `case default` runs when nothing else matched. It can be anywhere in the switch, and there can be only one.
- If nothing matches and there is no `default`, nothing happens.
- Each case has its own `{ }` block, with its own variables.

### Several values in one case

Separate them with commas:

```cit
for (let day in ["Mon", "Sat", "Sun", "Xyz"]) {
    switch (day) {
        case "Sat", "Sun" {
            println(day, "-> weekend")
        }
        case "Mon" {
            println(day, "-> start of the week")
        }
        case default {
            println(day, "-> not a day I know")
        }
    }
}
```

Output:

```text
Mon -> start of the week
Sat -> weekend
Sun -> weekend
Xyz -> not a day I know
```

### It works with any value

Numbers, booleans, lists, and results of calculations:

```cit
let score = 85
switch (score // 10) {
    case 10, 9 { println("Grade A") }
    case 8 { println("Grade B") }
    case 7 { println("Grade C") }
    case default { println("Keep practicing") }
}
```

Output:

```text
Grade B
```

### `break`, `continue` and `return` inside a switch

- `break` ends the **switch**, not a loop around it.
- `continue` and `return` carry on to the surrounding loop or function.

```cit
for (let n, range(1, 5)) {
    switch (n) {
        case 2 { continue }       # skip the printing below
        case 3 { break }          # leave the switch only
    }
    println("n is", n)
}
```

Output:

```text
n is 1
n is 3
n is 4
```

```cit
fn describe(n) {
    switch (n) {
        case 0 { return "zero" }
        case 1 { return "one" }
        case default { return "many" }
    }
}
println(describe(0), describe(1), describe(7))
```

Output:

```text
zero one many
```

## Common mistakes

A `switch` needs `case` blocks (not plain statements):

```cit
switch (1) {
    println("hi")
}
```

Result:

```text
[CIT Error] Line 2, column 5: Expected 'case' inside a switch block.
```

Only one `case default` is allowed:

```cit
switch (1) {
    case default { }
    case default { }
}
```

Result:

```text
[CIT Error] Line 3, column 5: A switch can only have one 'case default'.
```

## Try it yourself

1. Write a program that prints `"even"` or `"odd"` for a number.
2. Turn the numbers 1 to 7 into day names with a `switch`.
3. Ask for a password; print `"Welcome"` if it equals `"cit123"`.

Previous: [4. Strings](04-strings.md) | Next: [6. Loops](06-loops.md)
