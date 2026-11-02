# 7. Lists

A **list** holds many values in order.

## Creating a list

```cit
let mut nums = [1, 2, 3, 4]
let names = ["Ada", "Linus"]
let mixed = [1, "two", true, null, [3, 4]]
let empty = []
println(nums, names, mixed, empty)
```

Output:

```text
[1, 2, 3, 4] ["Ada", "Linus"] [1, "two", true, null, [3, 4]] []
```

Lists print the way you write them (text inside a list shows its quotes). A trailing comma is allowed, and lists can hold lists.

## Reading items

Positions start at `0`. Negative positions count from the end.

```cit
let letters = ["a", "b", "c", "d"]
println(letters[0], letters[3])
println(letters[-1], letters[-2])
println(len(letters))
```

Output:

```text
a d
d c
4
```

A position that does not exist is an error:

```cit
let letters = ["a", "b"]
println(letters[5])
```

Result:

```text
[CIT Error] Line 2, column 16: Index 5 is out of range for a list of length 2.
```

Lists inside lists:

```cit
let grid = [[1, 2, 3], [4, 5, 6]]
println(grid[1][2])
```

Output:

```text
6
```

## Changing a list needs `let mut`

You can always **read** a list. To **change** it (set an item or call a method that modifies it), declare it with `let mut`.

```cit
let mut nums = [1, 2, 3]
nums[0] = 100
nums[-1] += 5
println(nums)
```

Output:

```text
[100, 2, 8]
```

```cit
let nums = [1, 2, 3]
nums.append(4)
```

Result:

```text
[CIT Error] Line 2, column 6: Cannot change list 'nums' because it was declared with 'let'. Use 'let mut nums'.
```

## Working with lists

```cit
let a = [1, 2]
let b = [3]
println(a + b)                 # joining two lists makes a new one
println(2 in a, 9 in a)        # is it in the list?
println([1, 2] == [1, 2])      # compared item by item
println(len(a + b))
```

Output:

```text
[1, 2, 3]
true false
true
3
```

Loop over a list with `for ... in`:

```cit
for (let n in [10, 20, 30]) {
    println(n)
}
```

Output:

```text
10
20
30
```

Empty lists are false in conditions, lists with items are true.

## Two names, one list

A list is not copied when you give it a second name. Both names point to the same list. Use `.copy()` for an independent copy.

```cit
let mut a = [1, 2]
let mut b = a
b.append(3)
println(a)          # a changed too!

let mut c = a.copy()
c.append(4)
println(a, c)
```

Output:

```text
[1, 2, 3]
[1, 2, 3] [1, 2, 3, 4]
```

A function that receives a list can change it for the caller:

```cit
fn addOne(list) {
    list.append(1)
}
let mut data = []
addOne(data)
addOne(data)
println(data)
```

Output:

```text
[1, 1]
```

## List methods

| Method | Changes the list? | What it does |
| --- | --- | --- |
| `append(x)` | yes | add `x` at the end |
| `insert(i, x)` | yes | put `x` at position `i` |
| `unshift(x, ...)` | yes | add at the **start**, returns the new length |
| `pop()` / `pop(i)` | yes | remove and return the last item (or item `i`) |
| `shift()` | yes | remove and return the **first** item |
| `remove(x)` | yes | remove the first item equal to `x` |
| `splice(start, count, ...)` | yes | remove `count` items at `start` (and insert new ones), returns the removed ones |
| `clear()` | yes | remove everything |
| `reverse()` | yes | reverse the order |
| `count(x)` | no | how many items equal `x` |
| `index(x)` | no | position of the first `x` |
| `include(x)` | no | is `x` in the list? |
| `copy()` | no | an independent copy |
| `slice(start, end)` | no | a new list with part of the items |
| `map(f)` | no | a new list with `f` applied to each item |
| `filter(f)` | no | a new list with the items where `f` is true |
| `reduce(f, start)` | no | combine all items into one value |
| `find(f)` | no | the first item where `f` is true, or `null` |

### Adding

```cit
let mut list = [2, 3]
list.append(4)
list.insert(0, 1)
println(list)
println(list.unshift(-1, 0))     # adds to the start, returns the new length
println(list)
```

Output:

```text
[1, 2, 3, 4]
6
[-1, 0, 1, 2, 3, 4]
```

### Removing

```cit
let mut list = ["a", "b", "c", "b", "d"]
println(list.pop())          # removes the last item
println(list.pop(0))         # removes item 0
list.remove("b")             # removes the first "b"
println(list)
println(list.shift())        # removes the first item
println(list)
list.clear()
println(list)
```

Output:

```text
d
a
["c", "b"]
c
["b"]
[]
```

`remove`, `index` and `pop` stop with an error when there is nothing to find or remove:

```cit
let mut list = [1, 2]
list.remove(99)
```

Result:

```text
[CIT Error] Line 2, column 6: remove(): 99 is not in the list.
```

### `splice`: remove and insert anywhere

`splice(start, count, newItems...)` removes `count` items at `start` and puts the new items in their place. It returns the removed items. Leave out `count` to remove everything from `start` on.

```cit
let mut list = [1, 2, 3, 4, 5]
println(list.splice(1, 2))        # removes 2 and 3
println(list)
list.splice(1, 0, "x", "y")       # removes nothing, inserts two items
println(list)
list.splice(-2)                   # removes the last two
println(list)
```

Output:

```text
[2, 3]
[1, 4, 5]
[1, "x", "y", 4, 5]
[1, "x", "y"]
```

### Searching and counting

```cit
let list = [5, 6, 7, 6]
println(list.count(6), list.index(7), list.include(8))
```

Output:

```text
2 2 false
```

### Copies and parts

```cit
let list = [1, 2, 3, 4, 5]
println(list.slice(1, 3))      # items 1 and 2
println(list.slice(-2))        # the last two
println(list.slice(2))         # from item 2 on
println(list.slice())          # a copy
```

Output:

```text
[2, 3]
[4, 5]
[3, 4, 5]
[1, 2, 3, 4, 5]
```

### Reversing

```cit
let mut list = [1, 2, 3]
list.reverse()
println(list)
```

Output:

```text
[3, 2, 1]
```

## Functions that work on each item: `map`, `filter`, `reduce`, `find`

These four take a **function** (usually a short lambda like `x => x * 2`, see [chapter 9](09-functions.md)) and call it for each item.

```cit
let nums = [1, 2, 3, 4, 5, 6]

println(nums.map(n => n * 10))            # change every item
println(nums.filter(n => n % 2 == 0))     # keep some items
println(nums.find(n => n > 4))            # first match (or null)
println(nums.reduce((a, b) => a + b))     # combine into one value
println(nums.reduce((a, b) => a * b, 1))  # with a starting value
```

Output:

```text
[10, 20, 30, 40, 50, 60]
[2, 4, 6]
5
21
720
```

The function also receives the position as a second value:

```cit
println(["a", "b", "c"].map((item, i) => $"{i}:{item}"))
```

Output:

```text
["0:a", "1:b", "2:c"]
```

`reduce` on an empty list needs a starting value:

```cit
println([].reduce((a, b) => a + b, 0))
```

Output:

```text
0
```

```cit
println([].reduce((a, b) => a + b))
```

Result:

```text
[CIT Error] Line 1, column 12: reduce() of an empty list needs a starting value: list.reduce(fn, start).
```

They chain nicely:

```cit
let result = range(1, 11)
    .filter(n => n % 2 == 0)
    .map(n => n * n)
    .reduce((a, b) => a + b)
println(result)
```

Output:

```text
220
```

## Helpful built-in functions for lists

```cit
let nums = [4, 8, 1, 9]
println(len(nums), min(nums), max(nums), sum(nums))
println(range(5))
println(sum(range(1, 101)))
```

Output:

```text
4 1 9 22
[0, 1, 2, 3, 4]
5050
```

## Try it yourself

1. Make a list of five fruits and print the last one.
2. Remove the second fruit, then add `"kiwi"` at the start.
3. Use `map` to turn `[1, 2, 3]` into `[2, 4, 6]`.
4. Use `filter` to keep the names that start with `"A"` from `["Ada", "Bob", "Alan"]`.

Previous: [6. Loops](06-loops.md) | Next: [8. Dictionaries](08-dictionaries.md)
