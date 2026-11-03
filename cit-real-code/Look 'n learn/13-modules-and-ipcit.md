# 13. Modules and ipcit

As programs grow, you can split them into several files, and share code with other people as **packages**.

## `import`

`import` runs another `.cit` file and gives you its functions, classes and variables.

Imagine a file `lib/greeter.cit`:

```cit
# lib/greeter.cit
let greeting = "Hello"

fn greet(name) {
    return $"{greeting}, {name}!"
}

class counter() {
    fn struct() {
        self.count = 0
    }
    fn up() {
        self.count++
        return self.count
    }
}
```

and a main file next to the `lib` folder:

```cit
import "./lib/greeter" as greeter

println(greeter.greet("Ada"))      # Hello, Ada!
println(greeter.greeting)          # Hello
let c = greeter.counter()
c.up()
println(c.up())                    # 2
```

Things to know:

- `import "path"` takes a **text** that is either a relative file path (starting with `./` or `../`, and the `.cit` ending may be left out) or a package name (see below).
- `import "x" as name` chooses the name you use in your file. Without `as`, the name comes from the last part of the path (`import "./lib/greeter"` is called `greeter`).
- Everything the module declares at its top level is available as `name.something`: functions, classes and variables.
- A module runs **once**, even if several files import it.
- Two modules importing each other is an error (*Circular import*).
- If something goes wrong inside a module, the error message says which module.

A working example is in the `examples` folder: `14-modules.cit`.

### Built-in modules, named imports, and multiple imports

The standard `math`, `ui`, `ui-style`, `json`, and `time` modules do not need to be installed:

```cit
import math
println(math.sqrt(16))
import pi from math
println(pi)
```

Import several packages or built-in modules in one statement:

```cit
import {
    math,
    ui,
    ...
}
```

The `...` is an optional visual placeholder; list the actual module names you want to import.

`json` converts between CIT values and JSON text. JSON objects load as CIT dictionaries:

```cit
import json
let text = json.dumps({name: "Ada", score: 10}, indent = 2, sortKeys = true)
let data = json.loads(text)
println(data["name"])
```

`json.dump(value, file)` and `json.load(file)` write/read JSON through a file opened with `open(...)`.

The `time` module provides `time()`, `ctime()`, `perfCounter()`, `localtime()`, `gmtime()`, `asctime()`, `strftime()` and `strptime()`:

```cit
import time
println(time.strftime("%Y-%m-%d", time.localtime()))
```

## Packages and `ipcit`

`ipcit` is CIT's package manager. A **package** is a folder with an `ipcit.json` file that other projects can install.

### Using ipcit

Open the Command Palette in VS Code and run **CIT: Open ipcit (Package Manager)**. You get an `ipcit>` prompt. (If you have Node.js installed, you can also type `ipcit ...` in any terminal opened inside VS Code.)

| Command | What it does |
| --- | --- |
| `ipcit init [name]` | create an `ipcit.json` for your project |
| `ipcit install [pkg[@version]]` | install a package; with no name, install everything listed in `ipcit.json` |
| `ipcit install ./folder` | install a package from a folder on your computer |
| `ipcit uninstall <pkg>` | remove a package |
| `ipcit list` | show the installed packages |
| `ipcit search [text]` | search the registry |
| `ipcit info <pkg>` | show details about a registry package |
| `ipcit help` / `ipcit version` | help and version |

Packages are copied into a `cit_packages` folder in your project, and recorded in `ipcit.json`:

```text
my-project/
├── ipcit.json
├── main.cit
└── cit_packages/
    └── mathx/
        ├── ipcit.json
        └── main.cit
```

Then use them by name:

```cit
import "mathx"
import "mathx" as m

println(mathx.double(21))
println(m.double(4))
```

### Making a package

A package is any folder with an `ipcit.json` and a main file:

```text
{
  "name": "mathx",
  "version": "1.0.0",
  "description": "Small math helpers",
  "main": "main.cit",
  "dependencies": {}
}
```

- `name`: lowercase letters, digits, `.`, `-` and `_`.
- `main`: the file that `import "mathx"` runs (default `main.cit`).
- `dependencies`: other packages it needs; `ipcit install` installs those too.

Test your package by installing it from its folder: `ipcit install ./mathx`.

### The registry

`ipcit install name` looks in the registry folder (`registry/packages/<name>/<version>/` inside the extension). It is empty for now, and packages will be added later. Until then, install from folders.

## Try it yourself

1. Move a function from one of your programs into its own file and import it.
2. Run `ipcit init` in a project and look at the `ipcit.json` it creates.

Previous: [12. Built-in functions](12-built-in-functions.md) | Next: [14. Tools and editor](14-tools-and-editor.md)
