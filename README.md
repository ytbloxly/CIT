<h1 align="center">CIT (Code Information Technology)</h1>

<p align="center">
  A small, readable programming language with its own VS Code extension, a built-in interpreter and a package manager.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.7.1-blue">
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
# Variables: inferred, mutable, and typed
let name = "Ada"
let mut total = 0
int age = 23

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

while (total < 3) {
    total = total + 1
}

# Functions with default and named arguments
fn add(a, b = 1) {
    return a + b
}
println(add(2))        # 3
println(add(2, b: 4))  # 6

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
- `if` / `elseif` / `else`, `while`, numeric `for` with `range`, plus `break`, `continue`, `pass` and `return`.
- Functions with default and named arguments.
- Classes with `fn struct(...)` constructors and `self`.
- Interpolated strings: `$"Hello, {name}!"`.
- Operators: `+ - * / % // **`, `== != < > <= >=`, `&& || !`, and the words `and` / `or` / `not`.
- Conversions: `castInt`, `castFloat`, `castString`, `castBool`.
- Comments with `#` and `/* ... */`.
- Modules and packages with `import "name"` and `import "name" as alias`.

### Install the VS Code extension

1. Open VS Code and go to Extensions (`Ctrl+Shift+X`).
2. Click the `...` menu and choose **Install from VSIX...**.
3. Select `cit-language-0.7.1.vsix`.
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

while (total < 3) {
    total = total + 1
}

# Funciones con argumentos por defecto y con nombre
fn add(a, b = 1) {
    return a + b
}
println(add(2))        # 3
println(add(2, b: 4))  # 6

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
warnln("Esto es una advertencia")   # amarillo
errorln("Esto es un error")         # rojo
println(castInt("42"))
```

### Características

- Variables inferidas (`let`), variables mutables (`let mut`) y declaraciones con tipo (`int`, `float`, `str`, `char`, `bool`).
- `if` / `elseif` / `else`, `while`, `for` numérico con `range`, además de `break`, `continue`, `pass` y `return`.
- Funciones con argumentos por defecto y con nombre.
- Clases con constructores `fn struct(...)` y `self`.
- Cadenas interpoladas: `$"¡Hola, {name}!"`.
- Operadores: `+ - * / % // **`, `== != < > <= >=`, `&& || !` y las palabras `and` / `or` / `not`.
- Conversiones: `castInt`, `castFloat`, `castString`, `castBool`.
- Comentarios con `#` y `/* ... */`.
- Módulos y paquetes con `import "nombre"` e `import "nombre" as alias`.

### Instalar la extensión de VS Code

1. Abre VS Code y ve a Extensiones (`Ctrl+Shift+X`).
2. Haz clic en el menú `...` y elige **Instalar desde VSIX...**.
3. Selecciona `cit-language-0.7.1.vsix`.
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
