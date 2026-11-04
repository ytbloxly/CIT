<h1 align="center">CIT 1 Gen (Code Information Technology)</h1>

<p align="center">
  A small, readable programming language with its own VS Code extension, a built-in interpreter and a package manager.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.1-blue">
  <img alt="Files" src="https://img.shields.io/badge/files-.cit%20%7C%20.ct-informational">
  <img alt="Editor" src="https://img.shields.io/badge/editor-VS%20Code-007ACC">
</p>

<p align="center">
  <b>English</b> · <a href="#español">Español</a>
</p>

---

## English

### What is CIT?

CIT 1 Gen is a beginner-friendly programming language that gets out of your way. There is no `main` function, no boilerplate and no compiler to install: write a line, press Run, and it works. The VS Code extension bundles everything you need, including the interpreter, syntax highlighting, snippets, hover definitions, Go to Definition and a terminal runner.

### Hello, World! — CIT vs C++ vs Java

The same program in three languages:

**C++**

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
```

**Java**

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

**CIT**

```
println("Hello, World!")
```

| | C++ | Java | CIT |
| --- | :---: | :---: | :---: |
| Lines of code | 6 | 5 | **1** |
| Needs a `main` function | Yes | Yes | **No** |
| Needs an `#include` / class wrapper | Yes | Yes | **No** |
| Needs a separate compile step | Yes | Yes | **No** |
| Semicolons required | Yes | Yes | **No** |
| Install a compiler / JDK | Yes | Yes | **No** (bundled) |

> CIT is a young, interpreted language that runs on its own bundled VM. It is designed for clarity and learning, not for raw performance. C++ and Java are far more mature and much faster for heavy workloads.

### A quick tour

```
# Variables: inferred, mutable and typed
let name = "Ada"
let mut total = 0
int age = 23

# Empty variables must be "let mut" (they get a value later)
let mut nickname
nickname = "Coder"

# Several variables at once
let a, b, c = 2, 3, 4    # a = 2, b = 3, c = 4

# Math shortcuts: += -= *= /= %= **= //=
total += 10
total *= 6
println(total)           # 60

# Conditions
if (total >= 60) {
    println("Excellent!")
} elseif (total >= 30) {
    println("Good!")
} else {
    println("Keep practicing!")
}

# Loops (the range end is exclusive: 0, 1, 2, 3, 4)
for (let i, range(0, 5)) {
    println(i)
}

while (total < 63) {
    total += 1
}

do {
    total -= 1
} while (total > 61)
println(total)           # 61

# Lists
let mut nums = [1, 2, 3, 4]
nums.append(5)
nums.insert(0, 0)
println(nums)            # [0, 1, 2, 3, 4, 5]
println(nums.pop())      # 5
println(nums[0], len(nums))
println(sum(nums), min(nums), max(nums))
println(range(2, 6))     # [2, 3, 4, 5]

# Functions with default and named arguments
fn add(a, b = 1) {
    return a + b
}
let result = add(2, b: 4)
println(result)          # 6

# Classes
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }
    fn talk() {
        println($"Hello, I am {self.name}!")
    }
}
let p = person("Adam", 23)
p.talk()

# Input, colored output and conversions
let answer = input("What is your name? ")
println($"Hello, {answer}!")
warnln("This is a warning")      # yellow
errorln("This is an error")      # red
println(castInt("42"))
```

### Features

- Inferred variables (`let`), mutable variables (`let mut`) and typed declarations (`int`, `float`, `str`, `char`, `bool`).
- **Empty variables** (`let mut name`, then `name = "Coder"`) and **multiple assignment** (`let a, b, c = 2, 3, 4`).
- A single value can initialize several variables at once: `let mut a, b, c = 2`.
- **Math shortcuts**: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`, and `n++`, `++n`, `n--`, `--n`.
- **Operators**: `+ - * / % // **`, `== != < > <= >=`, `&& || !`, and **`in`** for text, lists and dictionaries. (The words `and`, `or` and `not` were removed: use `&&`, `||` and `!`.)
- **Control flow**: `if` / `elseif` / `else`, `while`, `do { ... } while (...)`, **`for (let i, range(0, 12))`** (with a step: `range(0, 12, 2)`), `for (let item in list)`, `switch` / `case`, plus `break`, `continue`, `pass` and `return`.
- **Errors**: `try` / `catch` / `throw`, safe navigation `value?.method()`, a `fallback` for conversions (`castInt(text, fallback = 0)`), and **`defer`** to run code when a function ends.
- **Strings**: `"text"`, `$"Hello, {name}!"`, **multi-line strings** (`"""..."""`) and 18 methods such as `upper`, `split`, `replace` and `startPad`.
- **Lists** with 18 methods (`map`, `filter`, `reduce`, `splice`...), **dictionaries** `{name: "Coder", age: 24}` with 11 methods, and numbers with `toFixed`.
- **Built-in functions**: `range()`, `min()`, `max()`, `sum()`, `len()` (lists, strings and dictionaries), `random()` and `randint()`.
- **Functions** with default and named arguments, stored in variables, **lambdas** (`x => x * x`, `x, y => return x * y`) and closures.
- **Classes** with `fn struct(...)`, `self`, **inheritance** (`class builder(person())`) and `super()`.
- **Collections**: heterogeneous lists, dictionaries, sets (`{1, 2, 2}`), immutable tuples (`(1, "two")`), plus `frozendict()` and `frozenset()`.
- **CIT 1 language features**: destructuring, read/time/line-based temporal variables, `offline` and `stopUse` lifetimes, loop `else`, block-valued conditions, slicing, `guard`, static values, constants, final classes, property getters/setters, decorators, enums and typed errors.
- **Math**: `import math` exposes rounding, roots, logarithms, trigonometry, factorial, gcd/lcm and constants (`pi`, `e`, `tau`, `nan`, `inf`).
- **Modules and values**: `import name from module`, built-in `json` and `time` modules, fixed-width declarations (`i8`-`i64`, `f8`-`f64`, `s8`-`s64`, `b8`/`b16`), and `longString` / `longNumber`.
- **Sets and tuples**: mutable set operations and immutable tuples, alongside constructors such as `list()`, `tuple()`, `set()`, `dict()`, `frozendict()` and `frozenset()`.
- **Errors and files**: `raise`, typed `except`, `finally`, UTF-8 `open()` with write/append/read, and `printf`, `exchange`, `task.wait`, `zip`, `enumerate`, `type`, `round`, `id`, `isinstance`, `issubclass`, `bin`, `square`.
- **CIT 1 Gen/Update 1**: `??`, temporal limit chaining, `*args` / `**kwargs`, async functions, custom binary operators, generic type-argument syntax and reactive `watch` blocks.
- **Standard modules**: statistics in `math`; parse/stringify/query and file helpers in `json`; terminal helpers (including hidden password input in the VS Code runner) in `cli`; date/time helpers in `datetime`; system information, program-scoped exit and VS Code clipboard access in `sys`; and SQLite through parameterized queries.
- HTML UI rendering and `window.prompt` / `window.alert` were removed in Update 1. Process execution and termination APIs (`sys.exec`, `sys.run`, `sys.kill`) are not exposed.
- **Editor support**: CIT syntax coloring, snippets, formatting, hover help and Go to Definition (`F12` / `Ctrl+Click`).
- Comments with `#` and `/* ... */`, and modules with `import "name"` / `import "name" as alias`.
- **Tools**: compile-before-run, **Format Document**, colored output, typed input in the terminal, snippets and the `ipcit` package manager.

### Lists at a glance

```
let mut nums = [3, 1, 2]
nums.append(4)         # [3, 1, 2, 4]
nums.insert(1, 9)      # [3, 9, 1, 2, 4]
nums.remove(9)         # [3, 1, 2, 4]
println(nums.pop())    # 4
nums.reverse()         # [2, 1, 3]
println(nums.count(1), nums.index(3))   # 1 2
let copy = nums.copy() # an independent copy
nums.clear()           # []
```

### CIT 1 Gen/Update 1 highlights

Temporal variables can expire by number of reads (`r`), seconds (`s`) or source lines (`l`):

```cit
let mut oneUse <1r> = "read once"
let mut lineScoped <30l> = "expires after 30 source lines"
let mut offlineValue <5s = offline> = "expires after five seconds without access"
let mut inactiveValue <5s = stopUse> = "expires after five seconds of VS Code inactivity"
```

`stopUse` uses VS Code window activity and has no activity signal in the standalone CLI. `longNumber` uses JavaScript numeric precision; it does not represent arbitrary-precision integers. Fixed-width numeric and string declarations validate their documented storage limits.

Classes include access-controlled fields, properties and inheritance:

```cit
class Account() {
    protected let mut balance = 0
    get fn credit() { return self.balance }
    set fn credit(value) { if (value >= 0) { self.balance = value } }
}
```

`pop()` takes the last item (or `pop(i)` for item `i`). `remove(x)` and `index(x)` stop with an error if `x` is not in the list. Without `mut`, a list can be read but not changed.

### More features

```
# Dictionaries (a bare name works as the key: info[name] is info["name"])
let mut info = {name: "Coder", work: "Coding in CIT", age: 24}
println(info[name])                  # Coder
info["city"] = "Warsaw"
println(info.get("email", "none"))   # none
for (let key in info) {
    println($"{key}: {info[key]}")
}

# ++ and --
let mut visits = 0
visits++
++visits
println(visits)                      # 2

# for-in loops and list methods with lambdas
let nums = [1, 2, 3, 4, 5, 6]
for (let n in nums) {
    if (n % 2 == 0) { println(n) }
}
println(nums.filter(n => n > 3).map(n => n * 10))   # [40, 50, 60]
println(nums.reduce((a, b) => a + b))               # 21

# Lambdas and functions stored in variables
let square = fn square(x) {
    return x * x
}
let rectangle = x, y => return x * y
println(square(4), rectangle(3, 5))                 # 16 15

# Strings
let s = "  Hello, CIT!  "
println(s.trim().upper())                           # HELLO, CIT!
println("7".startPad(3, "0"), "ab".repeat(3))       # 007 ababab
println("a-b-c".split("-"))                         # ["a", "b", "c"]

# Safe navigation: nothing happens when the value is null
let mut p = null
p?.talk()

# Inheritance
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }
    fn talk() {
        println($"Hello, I am {self.name}!")
    }
}
class builder(person()) {
    fn struct(name, age, company) {
        super().struct(name, age)
        self.company = company
    }
}
p = builder("Bob", 30, "ACME")
p?.talk()                                           # Hello, I am Bob!

# switch / case (no fall-through, several values per case)
let tier = "premium"
switch (tier) {
    case "free" {
        println("Standard content with ads.")
    }
    case "premium", "vip" {
        println("High-quality content, no ads.")
    }
    case default {
        println("Unknown tier.")
    }
}
```

### Errors, defer, multi-line strings and more

```
# for loops with a step (the loop variable can be "let mut")
for (let mut i, range(0, 12, 2)) {
    println(i)
}

# The in operator works with text, lists and dictionaries
str string = "Hello, CIT!"
if ("CIT!" in string) {
    println($"We found CIT! in {string}")
}

# try / catch / throw
let mut info = {name: "Adam", age: 23}
try {
    println(info[email])
} catch (err) {
    warnln($"Found a bug: {err}")
}
try {
    throw "Something went wrong"
} catch (reason) {
    println(reason)
}

# defer runs when the function ends
fn doSomething() {
    defer println("Prints last")
    println("Prints first")
}
doSomething()

# Fallback value for conversions
let number = castInt(input("How old are you: "), fallback = 0)
println(number)

# Multi-line strings
let menu = """
1. Start
2. Settings
3. Exit
"""
println(menu)

# Random numbers
let secret_number = random(1, 100).toFixed(2)   # a number like 8.22
let secret_number2 = randint(1, 100)            # a whole number from 1 to 100
println(secret_number >= 1, secret_number2 >= 1)
```

### Method reference

| Type | Methods |
| --- | --- |
| **List** | `append`, `pop`, `insert`, `clear`, `remove`, `reverse`, `count`, `index`, `copy`, `splice`, `unshift`, `shift`, `map`, `filter`, `reduce`, `slice`, `include`, `find` |
| **Dictionary** | `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys`, `clear` |
| **String** | `include`, `starts`, `ends`, `slice`, `substring`, `split`, `lower`, `upper`, `trim`, `replace`, `replaceAll`, `startPad`, `endPad`, `repeat`, `at`, `charAt`, `charCodeAt`, `indexOf` |
| **Number** | `toFixed` |

Good to know:

- Changing a list or dictionary needs `let mut`. Reading is always allowed.
- Reading a dictionary key that does not exist is an error. Use `d.get(key, fallback)` to avoid it.
- `d.default(key, value)` sets the key only if it is missing and returns the key's value. `d.fromkeys(keys, value)` returns a new dictionary and leaves `d` unchanged.
- In `info[name]`, a bare name that is not a variable is used as the key `"name"`. Use `info["name"]` to be explicit.
- `list.splice(start, count, ...items)` removes and inserts items and returns the removed ones. `shift()` and `unshift()` work on the front of a list.
- `s.split()` with no separator splits on whitespace. `s.indexOf(x)` returns `-1` when `x` is not found.
- `switch` has no fall-through: only the first matching `case` runs, and `break` ends the switch early.
- `catch (err)` receives the error message, or the exact value you gave to `throw`. Pressing `Ctrl+C` and the endless-loop guard are never caught.
- `defer` statements run in reverse order when the function ends, even after `return` or an error. At the top level of a file they run when the program ends.
- Named arguments can be written `name: value` or `name = value`, so `castInt(x, fallback = 0)` and `castInt(x, fallback: 0)` are the same.
- `n.toFixed(2)` gives back a **number** (`8.2222` becomes `8.22`), so trailing zeros are not shown (`8.50` prints as `8.5`).
- `random(a, b)` gives a decimal number from `a` to `b`; `randint(a, b)` gives a whole number and both ends can appear.
- In a multi-line string, the line break after the opening `"""` and the one before the closing `"""` are not part of the text.

### Learn CIT

- The **`Look 'n learn`** folder is a 21-chapter guide that explains the language and new features, with examples you can run. In VS Code, run **CIT: Open Look 'n learn (Docs)** from the Command Palette.
- The **`examples`** folder has one runnable program for each chapter, plus a guessing game and a mini project.

### Install the VS Code extension

1. Open VS Code and go to Extensions (`Ctrl+Shift+X`).
2. Click the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-1.0.1.vsix`.
4. Open any `.cit` or `.ct` file. VS Code selects CIT automatically.
5. Run it with the Play button in the editor, the right-click menu, or `Ctrl+F5`.

### Running programs in the terminal

Run first **compiles** your file (typing mistakes are reported before anything runs) and then opens a VS Code terminal named **CIT**:

- `println(...)` prints in the normal terminal color.
- `warnln(...)` prints in **yellow**.
- `errorln(...)` prints in **red**.
- `input("Prompt")` is typed directly in the terminal. Press Enter to submit.
- `Ctrl+C` stops a running program.

Use **Format Document** (`Shift+Alt+F`) to tidy your code. To use the CLI in Command Prompt or PowerShell, install Node.js and run `npm.cmd link` from the extension project folder. Use `cit file.cit` to run a program.

The CLI also supports `cit --open trm` (interactive terminal), `cit --crt file --nm main.cit` (create), `cit --enter main.cit` (run), and `cit --dlt main.cit` (delete).

### ipcit — the CIT package manager

`ipcit` installs and manages CIT packages. Open **CIT: Open ipcit (Package Manager)** from the Command Palette, or type `ipcit` in a VS Code terminal.

| Command | What it does |
| --- | --- |
| `ipcit init [name]` | Create an `ipcit.json` for your project |
| `ipcit install [pkg[@version]]` | Install a package, or everything listed in `ipcit.json` |
| `ipcit install ./folder` | Install a package from a local folder |
| `ipcit uninstall <pkg>` | Remove a package |
| `ipcit list` | List installed packages |
| `ipcit search [term]` | Search the registry |
| `ipcit info <pkg>` | Show details about a package |

Packages are installed into `cit_packages/` and recorded in `ipcit.json`. Use them in your code:

```
import "mypackage"
import "mypackage" as mp

println(mypackage.hello())
println(mp.hello())
```

> The package registry is empty for now. Official packages are coming soon. In the meantime you can install from a local folder with `ipcit install ./my-package`.

### Project structure

```
.
├── extension.js        # VS Code extension (terminal runner, ipcit terminal)
├── runtime/            # Compiler/interpreter, formatter, ipcit and terminal colors
├── bin/                # cit and ipcit command-line tools
├── registry/           # ipcit package registry (packages will be added here)
├── syntaxes/           # Syntax highlighting
├── snippets/           # Code snippets
├── examples/           # One runnable .cit program per chapter (01-hello-world.cit ... 15-mini-project.cit)
└── Look 'n learn/      # The guide: 21 chapters that explain the whole language
```

---

## Español

### ¿Qué es CIT?

CIT 1 Gen es un lenguaje de programación pensado para ser fácil de leer y de aprender. No hay función `main`, ni código repetitivo, ni compilador que instalar: escribes una línea, pulsas Ejecutar y funciona. La extensión de VS Code incluye todo lo necesario: el intérprete, el resaltado de sintaxis, los fragmentos de código, definiciones al pasar el cursor, Go to Definition y un ejecutor en terminal.

### ¡Hola, mundo! — CIT vs C++ vs Java

El mismo programa en tres lenguajes:

**C++**

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
```

**Java**

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

**CIT**

```
println("Hello, World!")
```

| | C++ | Java | CIT |
| --- | :---: | :---: | :---: |
| Líneas de código | 6 | 5 | **1** |
| Necesita una función `main` | Sí | Sí | **No** |
| Necesita `#include` / una clase contenedora | Sí | Sí | **No** |
| Necesita un paso de compilación aparte | Sí | Sí | **No** |
| Punto y coma obligatorio | Sí | Sí | **No** |
| Instalar compilador / JDK | Sí | Sí | **No** (incluido) |

> CIT es un lenguaje joven e interpretado que se ejecuta en su propia máquina virtual incluida. Está diseñado para la claridad y el aprendizaje, no para el máximo rendimiento. C++ y Java son mucho más maduros y bastante más rápidos en cargas de trabajo pesadas.

### Un recorrido rápido

```
# Variables: inferidas, mutables y con tipo
let name = "Ada"
let mut total = 0
int age = 23

# Las variables vacías deben ser "let mut" (reciben valor después)
let mut nickname
nickname = "Coder"

# Varias variables a la vez
let a, b, c = 2, 3, 4    # a = 2, b = 3, c = 4

# Atajos matemáticos: += -= *= /= %= **= //=
total += 10
total *= 6
println(total)           # 60

# Condiciones
if (total >= 60) {
    println("¡Excelente!")
} elseif (total >= 30) {
    println("¡Bien!")
} else {
    println("Sigue practicando")
}

# Bucles (el final de range es exclusivo: 0, 1, 2, 3, 4)
for (let i, range(0, 5)) {
    println(i)
}

while (total < 63) {
    total += 1
}

do {
    total -= 1
} while (total > 61)
println(total)           # 61

# Listas
let mut nums = [1, 2, 3, 4]
nums.append(5)
nums.insert(0, 0)
println(nums)            # [0, 1, 2, 3, 4, 5]
println(nums.pop())      # 5
println(nums[0], len(nums))
println(sum(nums), min(nums), max(nums))
println(range(2, 6))     # [2, 3, 4, 5]

# Funciones con argumentos por defecto y con nombre
fn add(a, b = 1) {
    return a + b
}
let result = add(2, b: 4)
println(result)          # 6

# Clases
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }
    fn talk() {
        println($"¡Hola, soy {self.name}!")
    }
}
let p = person("Adam", 23)
p.talk()

# Entrada, salida en color y conversiones
let answer = input("¿Cómo te llamas? ")
println($"¡Hola, {answer}!")
warnln("Esto es una advertencia")      # amarillo
errorln("Esto es un error")      # rojo
println(castInt("42"))
```

### Características

- Variables inferidas (`let`), variables mutables (`let mut`) y declaraciones con tipo (`int`, `float`, `str`, `char`, `bool`).
- **Variables vacías** (`let mut name`, y luego `name = "Coder"`) y **asignación múltiple** (`let a, b, c = 2, 3, 4`).
- Un valor también puede inicializar varias variables: `let mut a, b, c = 2`.
- **Atajos matemáticos**: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`, y `n++`, `++n`, `n--`, `--n`.
- **Operadores**: `+ - * / % // **`, `== != < > <= >=`, `&& || !` y **`in`** para texto, listas y diccionarios. (Las palabras `and`, `or` y `not` se eliminaron: usa `&&`, `||` y `!`.)
- **Control de flujo**: `if` / `elseif` / `else`, `while`, `do { ... } while (...)`, **`for (let i, range(0, 12))`** (con paso: `range(0, 12, 2)`), `for (let item in list)`, `switch` / `case`, además de `break`, `continue`, `pass` y `return`.
- **Errores**: `try` / `catch` / `throw`, navegación segura `valor?.metodo()`, un `fallback` para conversiones (`castInt(text, fallback = 0)`) y **`defer`** para ejecutar código cuando termina una función.
- **Cadenas de texto**: `"texto"`, `$"¡Hola, {name}!"`, **cadenas de varias líneas** (`"""..."""`) y 18 métodos como `upper`, `split`, `replace` y `startPad`.
- **Listas** con 18 métodos (`map`, `filter`, `reduce`, `splice`...), **diccionarios** `{name: "Coder", age: 24}` con 11 métodos, y números con `toFixed`.
- **Funciones integradas**: `range()`, `min()`, `max()`, `sum()`, `len()` (listas, cadenas y diccionarios), `random()` y `randint()`.
- **Funciones** con argumentos por defecto y con nombre, guardadas en variables, **lambdas** (`x => x * x`, `x, y => return x * y`) y closures.
- **Clases** con `fn struct(...)`, `self`, **herencia** (`class builder(person())`), `super()` y campos privados/protegidos.
- **Colecciones**: listas y diccionarios heterogéneos, conjuntos (`{1, 2, 2}`), tuplas inmutables (`(1, "dos")`), `frozendict()` y `frozenset()`.
- **Funciones de CIT 1**: desempaquetado, variables temporales por lecturas/segundos/líneas, modos `offline` y `stopUse`, `for-else`, condiciones como valores, slicing, `guard`, valores estáticos, constantes, clases `final`, getters/setters, decoradores y enums.
- **Matemáticas**: `import math` incluye redondeo, raíces, logaritmos, trigonometría, factorial, gcd/lcm y constantes (`pi`, `e`, `tau`, `nan`, `inf`).
- **Módulos y valores**: `import nombre from modulo`, módulos integrados `json` y `time`, declaraciones de ancho fijo (`i8`-`i64`, `f8`-`f64`, `s8`-`s64`, `b8`/`b16`), y `longString` / `longNumber`.
- **Archivos y utilidades**: `open()` para leer/escribir UTF-8, `printf`, `exchange`, `task.wait`, `zip`, `enumerate`, `type`, `round`, `id`, `isinstance`, `issubclass`, `bin` y `square`.
- **CIT 1 Gen/Update 1**: `??`, límites temporales encadenados, `*args` / `**kwargs`, funciones async, operadores binarios personalizados, sintaxis genérica y bloques reactivos `watch`.
- **Módulos integrados**: estadísticas en `math`; parse/stringify/query y archivos en `json`; herramientas de terminal (incluida la entrada oculta de contraseñas en el ejecutor de VS Code) en `cli`; fechas en `datetime`; información del sistema, salida limitada al programa y acceso al portapapeles de VS Code en `sys`; y SQLite con consultas parametrizadas.
- En Update 1 se eliminaron la interfaz HTML y `window.prompt` / `window.alert`. No se exponen APIs para ejecutar procesos ni terminarlos (`sys.exec`, `sys.run`, `sys.kill`).
- **Editor**: resaltado de CIT, snippets, formateador, ayuda al pasar el cursor y Go to Definition (`F12` / `Ctrl+Click`).
- Comentarios con `#` y `/* ... */`, y módulos con `import "nombre"` / `import "nombre" as alias`.
- **Herramientas**: compilación antes de ejecutar, **Formatear documento**, salida en color, entrada escrita en la terminal, fragmentos de código (snippets) y el gestor de paquetes `ipcit`.

### Listas de un vistazo

```
let mut nums = [3, 1, 2]
nums.append(4)         # [3, 1, 2, 4]
nums.insert(1, 9)      # [3, 9, 1, 2, 4]
nums.remove(9)         # [3, 1, 2, 4]
println(nums.pop())    # 4
nums.reverse()         # [2, 1, 3]
println(nums.count(1), nums.index(3))   # 1 2
let copy = nums.copy() # una copia independiente
nums.clear()           # []
```

### Funciones destacadas de CIT 1 Gen/Update 1

Las variables temporales admiten límites por lecturas (`r`), segundos (`s`) y líneas de código (`l`):

```cit
let mut oneUse <1r> = "se lee una vez"
let mut lineScoped <30l> = "caduca tras 30 líneas de código"
let mut offlineValue <5s = offline> = "caduca tras cinco segundos sin acceso"
let mut inactiveValue <5s = stopUse> = "caduca tras cinco segundos de inactividad en VS Code"
```

`stopUse` utiliza la actividad de la ventana de VS Code; la CLI independiente no dispone de esa señal. `longNumber` usa la precisión numérica de JavaScript y no representa enteros de precisión arbitraria. Las declaraciones de ancho fijo validan sus límites de almacenamiento.

Las clases admiten campos con acceso controlado, propiedades y herencia:

```cit
class Account() {
    protected let mut balance = 0
    get fn credit() { return self.balance }
    set fn credit(value) { if (value >= 0) { self.balance = value } }
}
```

`pop()` quita el último elemento (o `pop(i)` el elemento `i`). `remove(x)` e `index(x)` se detienen con un error si `x` no está en la lista. Sin `mut`, una lista se puede leer pero no modificar.

### Más funciones

```
# Diccionarios (un nombre sin comillas sirve como clave: info[name] es info["name"])
let mut info = {name: "Coder", work: "Coding in CIT", age: 24}
println(info[name])                  # Coder
info["city"] = "Warsaw"
println(info.get("email", "none"))   # none
for (let key in info) {
    println($"{key}: {info[key]}")
}

# ++ and --
let mut visits = 0
visits++
++visits
println(visits)                      # 2

# Bucles for-in y métodos de listas con lambdas
let nums = [1, 2, 3, 4, 5, 6]
for (let n in nums) {
    if (n % 2 == 0) { println(n) }
}
println(nums.filter(n => n > 3).map(n => n * 10))   # [40, 50, 60]
println(nums.reduce((a, b) => a + b))               # 21

# Lambdas y funciones guardadas en variables
let square = fn square(x) {
    return x * x
}
let rectangle = x, y => return x * y
println(square(4), rectangle(3, 5))                 # 16 15

# Cadenas de texto
let s = "  Hello, CIT!  "
println(s.trim().upper())                           # HELLO, CIT!
println("7".startPad(3, "0"), "ab".repeat(3))       # 007 ababab
println("a-b-c".split("-"))                         # ["a", "b", "c"]

# Navegación segura: no pasa nada si el valor es null
let mut p = null
p?.talk()

# Herencia
class person() {
    fn struct(name, age) {
        self.name = name
        self.age = age
    }
    fn talk() {
        println($"¡Hola, soy {self.name}!")
    }
}
class builder(person()) {
    fn struct(name, age, company) {
        super().struct(name, age)
        self.company = company
    }
}
p = builder("Bob", 30, "ACME")
p?.talk()                                           # ¡Hola, soy Bob!

# switch / case (sin "fall-through", varios valores por case)
let tier = "premium"
switch (tier) {
    case "free" {
        println("Contenido estándar con anuncios.")
    }
    case "premium", "vip" {
        println("Contenido de alta calidad, sin anuncios.")
    }
    case default {
        println("Nivel desconocido.")
    }
}
```

### Errores, defer, cadenas de varias líneas y más

```
# Bucles for con paso (la variable del bucle puede ser "let mut")
for (let mut i, range(0, 12, 2)) {
    println(i)
}

# El operador in funciona con texto, listas y diccionarios
str string = "Hello, CIT!"
if ("CIT!" in string) {
    println($"¡Encontramos CIT! en {string}")
}

# try / catch / throw
let mut info = {name: "Adam", age: 23}
try {
    println(info[email])
} catch (err) {
    warnln($"Encontré un error: {err}")
}
try {
    throw "Algo salió mal"
} catch (reason) {
    println(reason)
}

# defer se ejecuta cuando termina la función
fn doSomething() {
    defer println("Se imprime al final")
    println("Se imprime primero")
}
doSomething()

# Valor de respaldo (fallback) para conversiones
let number = castInt(input("¿Cuántos años tienes? "), fallback = 0)
println(number)

# Cadenas de varias líneas
let menu = """
1. Empezar
2. Ajustes
3. Salir
"""
println(menu)

# Números aleatorios
let secret_number = random(1, 100).toFixed(2)   # un número como 8.22
let secret_number2 = randint(1, 100)            # un número entero de 1 a 100
println(secret_number >= 1, secret_number2 >= 1)
```

### Referencia de métodos

| Tipo | Métodos |
| --- | --- |
| **Lista** | `append`, `pop`, `insert`, `clear`, `remove`, `reverse`, `count`, `index`, `copy`, `splice`, `unshift`, `shift`, `map`, `filter`, `reduce`, `slice`, `include`, `find` |
| **Diccionario** | `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys`, `clear` |
| **Cadena** | `include`, `starts`, `ends`, `slice`, `substring`, `split`, `lower`, `upper`, `trim`, `replace`, `replaceAll`, `startPad`, `endPad`, `repeat`, `at`, `charAt`, `charCodeAt`, `indexOf` |
| **Número** | `toFixed` |

Conviene saber:

- Para modificar una lista o un diccionario hace falta `let mut`. Leer siempre se puede.
- Leer una clave que no existe en un diccionario es un error. Usa `d.get(clave, valor_por_defecto)` para evitarlo.
- `d.default(clave, valor)` asigna la clave solo si no existe y devuelve su valor. `d.fromkeys(claves, valor)` devuelve un diccionario nuevo y no cambia `d`.
- En `info[name]`, un nombre sin comillas que no sea una variable se usa como la clave `"name"`. Usa `info["name"]` para ser explícito.
- `list.splice(inicio, cantidad, ...elementos)` quita e inserta elementos y devuelve los que quitó. `shift()` y `unshift()` trabajan al principio de la lista.
- `s.split()` sin separador divide por espacios en blanco. `s.indexOf(x)` devuelve `-1` si no encuentra `x`.
- `switch` no tiene "fall-through": solo se ejecuta el primer `case` que coincide, y `break` termina el switch antes.
- `catch (err)` recibe el mensaje de error, o el valor exacto que diste a `throw`. `Ctrl+C` y la protección contra bucles infinitos nunca se capturan.
- Las instrucciones `defer` se ejecutan en orden inverso cuando termina la función, incluso tras un `return` o un error. En el nivel superior de un archivo se ejecutan cuando termina el programa.
- Los argumentos con nombre se pueden escribir `nombre: valor` o `nombre = valor`, así que `castInt(x, fallback = 0)` y `castInt(x, fallback: 0)` son lo mismo.
- `n.toFixed(2)` devuelve un **número** (`8.2222` pasa a `8.22`), así que los ceros finales no se muestran (`8.50` se imprime como `8.5`).
- `random(a, b)` devuelve un número decimal de `a` a `b`; `randint(a, b)` devuelve un entero y ambos extremos pueden salir.
- En una cadena de varias líneas, el salto de línea tras las comillas triples de apertura y el anterior a las de cierre no forman parte del texto.

### Aprende CIT

- La carpeta **`Look 'n learn`** es una guía de 21 capítulos sobre el lenguaje y sus nuevas funciones, con ejemplos que puedes ejecutar. En VS Code, ejecuta **CIT: Open Look 'n learn (Docs)** desde la paleta de comandos.
- La carpeta **`examples`** tiene un programa ejecutable por cada capítulo, además de un juego de adivinar el número y un miniproyecto.

### Instalar la extensión de VS Code

1. Abre VS Code y ve a Extensiones (`Ctrl+Shift+X`).
2. Haz clic en el menú `...` y elige **Instalar desde VSIX...**.
3. Selecciona `cit-language-1.0.1.vsix`.
4. Abre cualquier archivo `.cit` o `.ct`. VS Code selecciona CIT automáticamente.
5. Ejecútalo con el botón Play del editor, el menú contextual o `Ctrl+F5`.

### Ejecutar programas en la terminal

Al ejecutar, primero se **compila** el archivo (los errores de escritura se muestran antes de que se ejecute nada) y después se abre una terminal de VS Code llamada **CIT**:

- `println(...)` imprime con el color normal de la terminal.
- `warnln(...)` imprime en **amarillo**.
- `errorln(...)` imprime en **rojo**.
- `input("Mensaje")` se escribe directamente en la terminal. Pulsa Enter para enviar.
- `Ctrl+C` detiene un programa en ejecución.

Usa **Formatear documento** (`Shift+Alt+F`) para ordenar tu código. Para usar la CLI en Command Prompt o PowerShell, instala Node.js y ejecuta `npm.cmd link` desde la carpeta del proyecto.

También puedes usar `cit --open trm` (terminal interactiva), `cit --crt file --nm main.cit` (crear), `cit --enter main.cit` (ejecutar) y `cit --dlt main.cit` (eliminar).

### ipcit — el gestor de paquetes de CIT

`ipcit` instala y gestiona paquetes de CIT. Abre **CIT: Open ipcit (Package Manager)** desde la paleta de comandos, o escribe `ipcit` en una terminal de VS Code.

| Comando | Qué hace |
| --- | --- |
| `ipcit init [nombre]` | Crea un `ipcit.json` para tu proyecto |
| `ipcit install [paquete[@versión]]` | Instala un paquete, o todo lo listado en `ipcit.json` |
| `ipcit install ./carpeta` | Instala un paquete desde una carpeta local |
| `ipcit uninstall <paquete>` | Elimina un paquete |
| `ipcit list` | Lista los paquetes instalados |
| `ipcit search [término]` | Busca en el registro |
| `ipcit info <paquete>` | Muestra información de un paquete |

Los paquetes se instalan en `cit_packages/` y se registran en `ipcit.json`. Úsalos en tu código:

```
import "mipaquete"
import "mipaquete" as mp

println(mipaquete.hello())
println(mp.hello())
```

> El registro de paquetes está vacío por ahora. Los paquetes oficiales llegarán pronto. Mientras tanto, puedes instalar desde una carpeta local con `ipcit install ./mi-paquete`.

### Estructura del proyecto

```
.
├── extension.js        # Extensión de VS Code (ejecutor en terminal, terminal de ipcit)
├── runtime/            # Compilador/intérprete, formateador, ipcit y colores de la terminal
├── bin/                # Herramientas de línea de comandos cit e ipcit
├── registry/           # Registro de paquetes de ipcit (aquí se añadirán paquetes)
├── syntaxes/           # Resaltado de sintaxis
├── snippets/           # Fragmentos de código
├── examples/           # Un programa .cit ejecutable por capítulo (01-hello-world.cit ... 15-mini-project.cit)
└── Look 'n learn/      # La guía: 21 capítulos que explican todo el lenguaje
```

<p align="center"><sub>Made with ♥ · Hecho con ♥</sub></p>
