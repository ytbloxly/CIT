# 17. Decorators and built-ins

## Decorators

A decorator receives a function and returns the function that should be used:

```cit
let logger = fn logger(original_func) {
    return args => {
        println("Before the function starts...")
        let result = original_func(args)
        println("After the function starts...")
        return result
    }
}

@logger
fn say_hello(name) {
    println($"Hello, {name}!")
}

say_hello("Coder")
```

Decorators are applied when the function is declared. For multiple decorators, each one wraps the result of the decorator below it.

## Conditional expressions

An inline `if` chooses one of two values:

```cit
let number = 2
println("Even" if (number % 2 == 0) else "Odd")
```

## Useful built-ins

```cit
println(type(12), bin(12), square(5), round(3.14159, 2))
println(enumerate(["red", "blue"]))
println(zip(["a", "b"], [1, 2]))
```

- `type(value)` returns a CIT type name.
- `enumerate(values, start = 0)` returns `[index, value]` pairs. `enumarate` is also accepted for compatibility.
- `zip(list1, list2, ...)` pairs values up to the shortest input.
- `bin(integer)` returns a binary string; `square(number)` returns its square.
- `id(value)` returns a stable identity number during this run.
- `isinstance(value, type)` accepts a built-in type name (such as `int`) or a class; `issubclass(child, parent)` checks class inheritance.
- `printf(format, ...)` writes using `%s`, `%d`, `%i`, `%f` and `%%`, without adding a newline. Use `println` when you want a newline.
- `exchange(variable, value)` sets a mutable variable and returns its old value.

```cit
let mut score = 2
let oldScore = exchange(score, 20)
println(score, oldScore)
```

Output:

```text
20 2
```

`task.wait(seconds)` pauses the program for the given number of seconds.

Previous: [16. Tuples, sets and math](16-collections-and-math.md) | Next: [18. UI and text files](18-ui-and-files.md)
