# 10. Classes

A **class** is a blueprint for objects that keep data (properties) and have abilities (methods) together.

## A first class

```cit
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }

    fn talk() {
        println($"Hello, I am {self.name} and I am {self.age}.")
    }
}

let ada = person("Ada", 36)
ada.talk()
println(ada.name)
```

Output:

```text
Hello, I am Ada and I am 36.
Ada
```

- `class person() { ... }` creates the class. Inside it you can only write methods (`fn`).
- `fn struct(...)` is the **constructor**. It runs automatically when you create an object, and its parameters are what you pass in `person("Ada", 36)`.
- `self` means "this very object". Properties are created by assigning to `self.something`.
- Create an object by calling the class like a function.

Every object has its own data:

```cit
class counter() {
    fn struct() {
        self.count = 0
    }
    fn up() {
        self.count++
    }
}

let a = counter()
let b = counter()
a.up()
a.up()
b.up()
println(a.count, b.count)
```

Output:

```text
2 1
```

## Reading and changing properties

```cit
class point() {
    fn struct(x, y) {
        self.x = x
        self.y = y
    }
}

let p = point(3, 4)
p.x = 10
p.y += 1
println(p.x, p.y)
println(p.z)           # a property that does not exist gives null
println(p)             # an object prints as <point object>
```

Output:

```text
10 5
null
<point object>
```

## Protected and private fields

Prefix an assignment to `self` with `protected` or `private` to limit who can read the field:

```cit
class account() {
    fn struct(bank, pin, balance) {
        self.bank = bank
        protected self.pin = pin
        private self.balance = balance
    }

    fn show() {
        println(bank, pin, balance)
    }
}

let card = account("Chase", 1234, 12.34)
card.show()
```

Methods in the declaring class can access both modifiers; subclasses can also access `protected` fields. Code outside the class cannot read or change either.

## Methods calling methods

Inside a method, use `self.` to reach the object's other methods and properties.

```cit
class account() {
    fn struct(owner, balance = 0) {
        self.owner = owner
        self.balance = balance
    }
    fn deposit(amount) {
        self.balance += amount
        self.report()
    }
    fn report() {
        println($"{self.owner} has {self.balance}")
    }
}

let acc = account("Ada")
acc.deposit(50)
acc.deposit(25)
```

Output:

```text
Ada has 50
Ada has 75
```

## Inheritance

A class can **inherit** from another class. The child gets all the parent's methods and can add or replace some. Write the parent in the parentheses:

```cit
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }

    fn talk() {
        println("Hello, I am talking!")
    }
}

class builder(person()) {
    fn struct(name, age, company) {
        super().struct(name, age)
        self.company = company
    }
}

let b = builder("Bob", 30, "ACME")
b.talk()                       # inherited from person
println(b.name, b.age, b.company)
```

Output:

```text
Hello, I am talking!
Bob 30 ACME
```

`super()` gives you the **parent's** version of the methods. `super().struct(name, age)` runs the parent's constructor so the shared properties are set up, and then the child adds its own.

### Overriding methods

A child can replace a method. Use `super()` to still run the parent's version when you want both:

```cit
class animal() {
    fn speak() {
        println("...")
    }
}

class dog(animal()) {
    fn speak() {
        super().speak()
        println("Woof!")
    }
}

animal().speak()
dog().speak()
```

Output:

```text
...
...
Woof!
```

### The child's version is used everywhere

Even inside the parent's own methods, `self.method()` picks the child's version:

```cit
class shape() {
    fn name() {
        return "a shape"
    }
    fn describe() {
        println($"I am {self.name()}")
    }
}

class circle(shape()) {
    fn name() {
        return "a circle"
    }
}

shape().describe()
circle().describe()
```

Output:

```text
I am a shape
I am a circle
```

### Constructors in the chain

If the child has no `struct`, the parent's is used. Chains can be as long as you like; each level calls `super()` for the level above:

```cit
class a() {
    fn struct() {
        self.log = "a"
    }
    fn who() {
        return "A"
    }
}
class b(a()) {
    fn struct() {
        super().struct()
        self.log += "b"
    }
    fn who() {
        return super().who() + "B"
    }
}
class c(b()) {
    fn struct() {
        super().struct()
        self.log += "c"
    }
    fn who() {
        return super().who() + "C"
    }
}

let obj = c()
println(obj.log, obj.who())
```

Output:

```text
abc ABC
```

Rules for inheritance:

- The parent class must be defined **before** the child.
- The parent is written as `parent()` (empty parentheses) or just `parent`.
- A class with no parent cannot use `super()`.
- A class has one parent only.

```cit
class lonely() {
    fn struct() {
        super().struct()
    }
}
lonely()
```

Result:

```text
[CIT Error] Line 1, column 1: 'lonely' has no parent class, so super() cannot be used.
```

## Safe calls on objects that may be missing

If a variable might be `null`, use `?.` so nothing happens instead of an error (more in [chapter 11](11-errors-and-safety.md)):

```cit
let mut friend = null
friend?.talk()
println("no crash")

class person() {
    fn talk() {
        println("Hi there!")
    }
}
friend = person()
friend?.talk()
```

Output:

```text
no crash
Hi there!
```

## Try it yourself

1. Make a `rectangle` class with `width`, `height` and an `area()` method.
2. Make a `square` class that inherits from it and only needs one side length.
3. Make `vehicle` and `car` classes where `car` overrides a `describe()` method and also calls the parent's.

Previous: [9. Functions](09-functions.md) | Next: [11. Errors and safety](11-errors-and-safety.md)
