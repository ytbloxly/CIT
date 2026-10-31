<h1 align="center">CIT (Code Information Technology)</h1>

<p align="center">
  A small, readable programming language with its own VS Code extension, a built-in interpreter and a package manager.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.8.1-blue">
  <img alt="Files" src="https://img.shields.io/badge/files-.cit%20%7C%20.ct-informational">
  <img alt="Editor" src="https://img.shields.io/badge/editor-VS%20Code-007ACC">
</p>

<p align="center">
  <b>English</b> · <a href="#español">Español</a>
</p>

---

## English

### What is CIT?

CIT is a beginner-friendly programming language that gets out of your way. There is no `main` function, no boilerplate and no compiler to install: write a line, press Run, and it works. The VS Code extension bundles everything you need, including the interpreter, syntax highlighting, snippets and a terminal runner.

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
for (let i, range = 0, 5) {
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
- **Empty variables** (`let mut name`, then `name = "Coder"`). An empty variable has to be `mut`, because otherwise it would stay empty forever.
- **Multiple assignment**: `let a, b, c = 2, 3, 4`.
- **Math shortcuts**: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`, and **`n++`, `++n`, `n--`, `--n`**.
- **Control flow**: `if` / `elseif` / `else`, `while`, `do { ... } while (...)`, numeric `for` with `range`, **`for (let item in list)`** loops, **`switch` / `case`**, plus `break`, `continue`, `pass` and `return`.
- **Lists**: `[1, 2, 3]`, indexing (`nums[0]`, `nums[-1]`) and 18 methods, including `map`, `filter`, `reduce` and `find`.
- **Dictionaries**: `{name: "Coder", age: 24}` with `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys` and `clear`.
- **Strings**: 18 methods such as `upper`, `lower`, `trim`, `split`, `replace`, `startPad`, `repeat` and `indexOf`.
- **Built-in functions**: `range()`, `min()`, `max()`, `sum()` and `len()`.
- **Functions** with default and named arguments. Functions are values: `let x = add(12)`, `let f = add`, **lambdas** such as `x => x * x`, `(a, b) => a + b` and `x, y => return x * y`.
- **Classes** with `fn struct(...)` constructors and `self`, plus **inheritance**: `class builder(person())` and `super()`.
- **Safe navigation**: `value?.method()` does nothing when the value is `null`.
- Interpolated strings: `$"Hello, {name}!"`.
- Operators: `+ - * / % // **`, `== != < > <= >=`, `&& || !`, and the words `and` / `or` / `not`.
- Conversions: `castInt`, `castFloat`, `castString`, `castBool`.
- Comments with `#` and `/* ... */`.
- Modules and packages with `import "name"` and `import "name" as alias`.

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

### Method reference

| Type | Methods |
| --- | --- |
| **List** | `append`, `pop`, `insert`, `clear`, `remove`, `reverse`, `count`, `index`, `copy`, `splice`, `unshift`, `shift`, `map`, `filter`, `reduce`, `slice`, `include`, `find` |
| **Dictionary** | `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys`, `clear` |
| **String** | `include`, `starts`, `ends`, `slice`, `substring`, `split`, `lower`, `upper`, `trim`, `replace`, `replaceAll`, `startPad`, `endPad`, `repeat`, `at`, `charAt`, `charCodeAt`, `indexOf` |

Good to know:

- Changing a list or dictionary needs `let mut`. Reading is always allowed.
- Reading a dictionary key that does not exist is an error. Use `d.get(key, fallback)` to avoid it.
- `d.default(key, value)` sets the key only if it is missing and returns the key's value. `d.fromkeys(keys, value)` returns a new dictionary and leaves `d` unchanged.
- In `info[name]`, a bare name that is not a variable is used as the key `"name"`. Use `info["name"]` to be explicit.
- `list.splice(start, count, ...items)` removes and inserts items and returns the removed ones. `shift()` and `unshift()` work on the front of a list.
- `s.split()` with no separator splits on whitespace. `s.indexOf(x)` returns `-1` when `x` is not found.
- `switch` has no fall-through: only the first matching `case` runs, and `break` ends the switch early.

### Install the VS Code extension

1. Open VS Code and go to Extensions (`Ctrl+Shift+X`).
2. Click the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-0.8.1.vsix`.
4. Open any `.cit` or `.ct` file. VS Code selects CIT automatically.
5. Run it with the Play button in the editor, the right-click menu, or `Ctrl+F5`.

### Running programs in the terminal

Run opens a VS Code terminal named **CIT**:

- `println(...)` prints in the normal terminal color.
- `warnln(...)` prints in **yellow**.
- `errorln(...)` prints in **red**.
- `input("Prompt")` is typed directly in the terminal. Press Enter to submit.
- `Ctrl+C` stops a running program.

If you have Node.js installed, you can also run `cit file.cit` from any terminal opened inside VS Code.

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
├── runtime/            # Interpreter, ipcit and terminal colors
├── bin/                # cit and ipcit command-line tools
├── registry/           # ipcit package registry (packages will be added here)
├── syntaxes/           # Syntax highlighting
├── snippets/           # Code snippets
└── examples/           # Example .cit programs
```

---

## Español

### ¿Qué es CIT?

CIT es un lenguaje de programación pensado para ser fácil de leer y de aprender. No hay función `main`, ni código repetitivo, ni compilador que instalar: escribes una línea, pulsas Ejecutar y funciona. La extensión de VS Code incluye todo lo necesario: el intérprete, el resaltado de sintaxis, los fragmentos de código y un ejecutor en terminal.

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
for (let i, range = 0, 5) {
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
- **Variables vacías** (`let mut name`, y luego `name = "Coder"`). Una variable vacía tiene que ser `mut`, porque si no se quedaría vacía para siempre.
- **Asignación múltiple**: `let a, b, c = 2, 3, 4`.
- **Atajos matemáticos**: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`, y **`n++`, `++n`, `n--`, `--n`**.
- **Control de flujo**: `if` / `elseif` / `else`, `while`, `do { ... } while (...)`, `for` numérico con `range`, bucles **`for (let item in list)`**, **`switch` / `case`**, además de `break`, `continue`, `pass` y `return`.
- **Listas**: `[1, 2, 3]`, índices (`nums[0]`, `nums[-1]`) y 18 métodos, entre ellos `map`, `filter`, `reduce` y `find`.
- **Diccionarios**: `{name: "Coder", age: 24}` con `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys` y `clear`.
- **Cadenas de texto**: 18 métodos como `upper`, `lower`, `trim`, `split`, `replace`, `startPad`, `repeat` e `indexOf`.
- **Funciones integradas**: `range()`, `min()`, `max()`, `sum()` y `len()`.
- **Funciones** con argumentos por defecto y con nombre. Las funciones son valores: `let x = add(12)`, `let f = add`, **lambdas** como `x => x * x`, `(a, b) => a + b` y `x, y => return x * y`.
- **Clases** con constructores `fn struct(...)` y `self`, y también **herencia**: `class builder(person())` y `super()`.
- **Navegación segura**: `valor?.metodo()` no hace nada si el valor es `null`.
- Cadenas interpoladas: `$"¡Hola, {name}!"`.
- Operadores: `+ - * / % // **`, `== != < > <= >=`, `&& || !` y las palabras `and` / `or` / `not`.
- Conversiones: `castInt`, `castFloat`, `castString`, `castBool`.
- Comentarios con `#` y `/* ... */`.
- Módulos y paquetes con `import "nombre"` e `import "nombre" as alias`.

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

### Referencia de métodos

| Tipo | Métodos |
| --- | --- |
| **Lista** | `append`, `pop`, `insert`, `clear`, `remove`, `reverse`, `count`, `index`, `copy`, `splice`, `unshift`, `shift`, `map`, `filter`, `reduce`, `slice`, `include`, `find` |
| **Diccionario** | `get`, `keys`, `values`, `items`, `update`, `pop`, `popitem`, `default`, `copy`, `fromkeys`, `clear` |
| **Cadena** | `include`, `starts`, `ends`, `slice`, `substring`, `split`, `lower`, `upper`, `trim`, `replace`, `replaceAll`, `startPad`, `endPad`, `repeat`, `at`, `charAt`, `charCodeAt`, `indexOf` |

Conviene saber:

- Para modificar una lista o un diccionario hace falta `let mut`. Leer siempre se puede.
- Leer una clave que no existe en un diccionario es un error. Usa `d.get(clave, valor_por_defecto)` para evitarlo.
- `d.default(clave, valor)` asigna la clave solo si no existe y devuelve su valor. `d.fromkeys(claves, valor)` devuelve un diccionario nuevo y no cambia `d`.
- En `info[name]`, un nombre sin comillas que no sea una variable se usa como la clave `"name"`. Usa `info["name"]` para ser explícito.
- `list.splice(inicio, cantidad, ...elementos)` quita e inserta elementos y devuelve los que quitó. `shift()` y `unshift()` trabajan al principio de la lista.
- `s.split()` sin separador divide por espacios en blanco. `s.indexOf(x)` devuelve `-1` si no encuentra `x`.
- `switch` no tiene "fall-through": solo se ejecuta el primer `case` que coincide, y `break` termina el switch antes.

### Instalar la extensión de VS Code

1. Abre VS Code y ve a Extensiones (`Ctrl+Shift+X`).
2. Haz clic en el menú `...` y elige **Instalar desde VSIX...**.
3. Selecciona `cit-language-0.8.1.vsix`.
4. Abre cualquier archivo `.cit` o `.ct`. VS Code selecciona CIT automáticamente.
5. Ejecútalo con el botón Play del editor, el menú contextual o `Ctrl+F5`.

### Ejecutar programas en la terminal

Al ejecutar se abre una terminal de VS Code llamada **CIT**:

- `println(...)` imprime con el color normal de la terminal.
- `warnln(...)` imprime en **amarillo**.
- `errorln(...)` imprime en **rojo**.
- `input("Mensaje")` se escribe directamente en la terminal. Pulsa Enter para enviar.
- `Ctrl+C` detiene un programa en ejecución.

Si tienes Node.js instalado, también puedes ejecutar `cit archivo.cit` desde cualquier terminal abierta dentro de VS Code.

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
├── runtime/            # Intérprete, ipcit y colores de la terminal
├── bin/                # Herramientas de línea de comandos cit e ipcit
├── registry/           # Registro de paquetes de ipcit (aquí se añadirán paquetes)
├── syntaxes/           # Resaltado de sintaxis
├── snippets/           # Fragmentos de código
└── examples/           # Programas de ejemplo en .cit
```

<p align="center"><sub>Made with ♥ · Hecho con ♥</sub></p>
