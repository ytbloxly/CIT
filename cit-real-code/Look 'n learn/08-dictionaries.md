# 8. Dictionaries

A **dictionary** stores values under names, called **keys**. Think of a contact card: the key `name` has the value `"Ada"`.

## Creating a dictionary

```cit
let mut info = {name: "Coder", work: "Coding in CIT", age: 24}
println(info)
println(info[name])
```

Output:

```text
{name: "Coder", work: "Coding in CIT", age: 24}
Coder
```

- Keys written as plain words (`name`) are the same as text keys (`"name"`).
- Keys can also be written as text in quotes (needed when they contain spaces), numbers, or `true` / `false`.
- Values can be anything, including lists and other dictionaries.

```cit
let person = {
    name: "Ada",
    "favorite color": "blue",
    7: "lucky",
    tags: ["math", "code"],
    address: {city: "London"}
}
println(person)
println(person["favorite color"], person[7], person[address][city])
```

Output:

```text
{name: "Ada", "favorite color": "blue", 7: "lucky", tags: ["math", "code"], address: {city: "London"}}
blue lucky London
```

An empty dictionary is `{}`.

## Reading values

```cit
let info = {name: "Coder", age: 24}
println(info["name"])        # with quotes
println(info[name])          # a bare name works too
```

Output:

```text
Coder
Coder
```

In `info[name]`, a bare name that is **not a variable** is used as the key `"name"`. If a variable called `name` does exist, its value is used instead. That is how you read a key you only know at runtime:

```cit
let info = {name: "Coder", age: 24}
let wanted = "age"
println(info[wanted])
```

Output:

```text
24
```

Use `info["name"]` with quotes if you want to be explicit.

Reading a key that does not exist is an error:

```cit
let info = {name: "Coder"}
println(info["email"])
```

Result:

```text
[CIT Error] Line 2, column 13: Key "email" was not found in the dictionary. Use d.get(key) to avoid this error.
```

Two ways to avoid that error: ask first with `in`, or use `get` with a fallback.

```cit
let info = {name: "Coder"}
if ("email" in info) {
    println(info["email"])
} else {
    println("no email")
}
println(info.get("email", "unknown"))
```

Output:

```text
no email
unknown
```

## Changing a dictionary needs `let mut`

```cit
let mut info = {name: "Coder", age: 24}
info["age"] = 25          # update
info[city] = "Warsaw"     # add a new key
info["age"]++             # math shortcuts work too
println(info)
```

Output:

```text
{name: "Coder", age: 26, city: "Warsaw"}
```

```cit
let info = {name: "Coder"}
info["age"] = 5
```

Result:

```text
[CIT Error] Line 2, column 5: Cannot change dictionary 'info' because it was declared with 'let'. Use 'let mut info'.
```

## Looking around

```cit
let info = {name: "Coder", age: 24}
println(len(info))                 # number of keys
println("name" in info)            # is the key there?
println(info == {name: "Coder", age: 24})
```

Output:

```text
2
true
true
```

## Looping

A `for ... in` loop goes through the **keys**, in the order they were added:

```cit
let scores = {ada: 10, bob: 7}
for (let key in scores) {
    println(key, "=", scores[key])
}
```

Output:

```text
ada = 10
bob = 7
```

## Dictionary methods

| Method | Changes the dictionary? | What it does |
| --- | --- | --- |
| `get(key, fallback)` | no | the value, or `fallback` (default `null`) if the key is missing |
| `keys()` | no | a list of the keys |
| `values()` | no | a list of the values |
| `items()` | no | a list of `[key, value]` pairs |
| `copy()` | no | an independent copy |
| `fromkeys(keys, value)` | no | a **new** dictionary with those keys, all set to `value` |
| `update(other)` | yes | add or overwrite entries from another dictionary (or list of pairs) |
| `pop(key, fallback)` | yes | remove the key and return its value |
| `popitem()` | yes | remove and return the **last** `[key, value]` pair |
| `default(key, value)` | yes | set the key to `value` **only if it is missing**, then return the key's value |
| `clear()` | yes | remove everything |

```cit
let info = {name: "Coder", age: 24}
println(info.get("name"), info.get("zzz"), info.get("zzz", 0))
println(info.keys())
println(info.values())
println(info.items())
```

Output:

```text
Coder null 0
["name", "age"]
["Coder", 24]
[["name", "Coder"], ["age", 24]]
```

```cit
let mut a = {x: 1}
a.update({y: 2, x: 10})          # x is overwritten, y is added
a.update([["z", 3]])             # a list of pairs works as well
println(a)
```

Output:

```text
{x: 10, y: 2, z: 3}
```

```cit
let mut d = {a: 1, b: 2, c: 3}
println(d.pop("a"))                 # 1 (and "a" is gone)
println(d.pop("zzz", "not there"))  # a fallback instead of an error
println(d.popitem())                # the last pair
println(d)
d.clear()
println(d)
```

Output:

```text
1
not there
["c", 3]
{b: 2}
{}
```

### `default`: set it only if missing

```cit
let mut settings = {volume: 5}
println(settings.default("volume", 9))   # already there: stays 5
println(settings.default("theme", "dark"))
println(settings)
```

Output:

```text
5
dark
{volume: 5, theme: "dark"}
```

### `copy` and `fromkeys`

```cit
let mut original = {x: 1}
let mut copy = original.copy()
copy["y"] = 2
println(original, copy)

let template = {}
println(template.fromkeys(["a", "b", "c"], 0))
println(template.fromkeys(["x", "y"]))      # without a value: null
```

Output:

```text
{x: 1} {x: 1, y: 2}
{a: 0, b: 0, c: 0}
{x: null, y: null}
```

Dictionary keys must be text, numbers or `true` / `false`. Lists cannot be keys.

## A classic: counting things

```cit
let mut counts = {}
for (let word in "the cat and the hat and the bat".split()) {
    counts[word] = counts.get(word, 0) + 1
}
println(counts)
```

Output:

```text
{the: 3, cat: 1, and: 2, hat: 1, bat: 1}
```

## Try it yourself

1. Make a dictionary for a book with `title`, `author` and `year`, and print each value.
2. Add a `pages` key and update the year.
3. Print every key and value with a loop.
4. Count the vowels in a sentence with a dictionary.

Previous: [7. Lists](07-lists.md) | Next: [9. Functions](09-functions.md)
