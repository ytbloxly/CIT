# 6. Loops

A **loop** repeats code.

## `while`

Repeats while its condition is true. The condition is checked **before** each round.

```cit
let mut countdown = 3
while (countdown > 0) {
    println(countdown)
    countdown--
}
println("Liftoff!")
```

Output:

```text
3
2
1
Liftoff!
```

If the condition never becomes false, the loop never ends. CIT stops runaway programs with the error *Loop limit exceeded* (or *Execution step limit exceeded*).

## `do { } while ( )`

Like `while`, but the body runs **first** and the condition is checked **after**, so the body always runs at least once.

```cit
let mut tries = 0
do {
    tries++
    println($"Try {tries}")
} while (tries < 3)
```

Output:

```text
Try 1
Try 2
Try 3
```

```cit
do {
    println("Hello!")
} while (false)
```

Output:

```text
Hello!
```

## `for` with `range`

Use it when you know how many times to repeat. The loop variable counts from the start up to (but **not including**) the end.

```cit
for (let i, range(0, 5)) {
    println(i)
}
```

Output:

```text
0
1
2
3
4
```

`range(start, end)` gives `start, start+1, ..., end-1`. You can also write just `range(end)`, which starts at `0`:

```cit
for (let i, range(3)) {
    println($"round {i}")
}
```

Output:

```text
round 0
round 1
round 2
```

### Steps

A third number is the **step**: how much to add each time.

```cit
for (let mut i, range(0, 12, 2)) {
    println(i)
}
```

Output:

```text
0
2
4
6
8
10
```

A negative step counts down (the end is still not included):

```cit
for (let i, range(10, 0, -3)) {
    println(i)
}
```

Output:

```text
10
7
4
1
```

The step cannot be `0`:

```cit
for (let i, range(0, 5, 0)) {
    println(i)
}
```

Result:

```text
[CIT Error] Line 1, column 10: The step in range(...) cannot be 0.
```

### `let` or `let mut`?

The loop variable is `let` by default, so the body cannot change it. Write `let mut` if you want to change it inside the body. Each round starts with a fresh value, so changing it never changes how many rounds there are.

```cit
let mut total = 0
for (let mut i, range(1, 4)) {
    i *= 10
    total += i
}
println(total)
```

Output:

```text
60
```

### The old way

Older versions wrote `for (let i, range = 0, 10)`. That form was replaced by `range(0, 10)` and gives a message telling you the new way:

```cit
for (let i, range = 0, 5) {
    println(i)
}
```

Result:

```text
[CIT Error] Line 1, column 13: The for loop is now written for (let i, range(0, 10)). The old 'range = 0, 10' form is no longer supported.
```

## `for` with `in`

Goes through the items of a list, the characters of a text, or the keys of a dictionary.

```cit
let mut nums = [1, 2, 3, 4]
for (let num in nums) {
    println(num)
}
```

Output:

```text
1
2
3
4
```

```cit
for (let letter in "CIT") {
    println(letter)
}
```

Output:

```text
C
I
T
```

```cit
let ages = {Ada: 36, Linus: 54}
for (let name in ages) {
    println(name, "is", ages[name])
}
```

Output:

```text
Ada is 36
Linus is 54
```

Use `.items()` to get the key and value together, and `range(...)` as a list:

```cit
let ages = {Ada: 36, Linus: 54}
for (let pair in ages.items()) {
    println(pair[0], "->", pair[1])
}
println(range(1, 6))
for (let n in range(1, 4)) {
    println(n * n)
}
```

Output:

```text
Ada -> 36
Linus -> 54
[1, 2, 3, 4, 5]
1
4
9
```

The loop works on a copy of the list, so adding to the list inside the loop does not make it endless:

```cit
let mut numbers = [1, 2]
for (let n in numbers) {
    numbers.append(n * 10)
}
println(numbers)
```

Output:

```text
[1, 2, 10, 20]
```

Like `for ... range`, the variable can be `let mut`: `for (let mut x in list)`.

## `break`, `continue`, `pass`

| Keyword | What it does |
| --- | --- |
| `break` | leave the loop right now |
| `continue` | skip to the next round |
| `pass` | do nothing (a placeholder where code is required) |

```cit
for (let i, range(0, 10)) {
    if (i == 3) { continue }     # skip 3
    if (i == 6) { break }        # stop at 6
    println(i)
}
```

Output:

```text
0
1
2
4
5
```

In nested loops, `break` and `continue` affect only the **innermost** loop.

```cit
for (let row, range(1, 4)) {
    for (let col, range(1, 4)) {
        if (col == 3) { break }
        println(row, col)
    }
}
```

Output:

```text
1 1
1 2
2 1
2 2
3 1
3 2
```

## Which loop should I use?

| I want to... | Use |
| --- | --- |
| repeat a known number of times | `for (let i, range(...))` |
| visit every item of a list / text / dictionary | `for (let x in ...)` |
| repeat until something happens | `while` |
| ask something at least once (like a menu) | `do { } while ( )` |

## Try it yourself

1. Print the 7 times table (7, 14, ..., 70) with a step.
2. Add up the numbers from 1 to 100 with `sum(range(1, 101))`, then again with a loop.
3. Use `do-while` to keep asking for a number until the user types something bigger than 10.

Previous: [5. Conditions](05-conditions.md) | Next: [7. Lists](07-lists.md)
