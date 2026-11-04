# 21. CIT 1 Gen/Update 1 features

Update 1 is version 1.0.1. It removes the former HTML UI and `window.prompt` / `window.alert` integrations; programs run in the terminal.

## Null coalescing and temporal limits

Use `??` to choose a fallback only for `null`. Optional member access (`?.`) prevents a null dereference:

```cit
let mut account = null
println(account?.name ?? "Guest")
```

Temporal limits can be chained. The value expires when the first limit is reached:

```cit
let mut temporary <3s> after <30l> = 12
```

## Variadic functions, async work and generic calls

`*args` captures extra positional values as a list, and `**kwargs` captures extra named values as a dictionary:

```cit
fn total(*args, **kwargs) {
    return sum(args) + kwargs["extra"]
}
println(total(1, 2, extra: 3))
```

Write `async fn` to define an asynchronous function. `await` is accepted only inside an async function:

```cit
async fn delayed() {
    await task.wait(0.01)
    return "ready"
}
println(delayed())
```

Generic parameter and call syntax is available for functions:

```cit
fn identity<T>(value) {
    return value
}
println(identity<int>(10))
```

Generic type arguments are currently annotations; they do not enforce runtime types.

## Custom operators and reactive values

Overload a supported binary operator inside a class:

```cit
class Vector() {
    fn struct(x, y) {
        self.x = x
        self.y = y
    }

    operator +(other) {
        return Vector(self.x + other.x, self.y + other.y)
    }
}

let result = Vector(2, 3) + Vector(4, 5)
println(result.x, result.y)
```

Reactive variables notify registered `watch` blocks when their values change:

```cit
reactive let mut score = 0
watch score {
    println($"Score changed to {score}")
}
score = 10
```

## Modules and SQLite

Update 1 adds statistics to `math`, JSON parsing/query/file helpers, date arithmetic and cron calculation in `datetime`, plus terminal helpers in `cli` and system information in `sys`. `json.colorize()` returns a pretty-printed JSON string with ANSI colors (or plain text when `NO_COLOR` is set).

SQLite uses bound values rather than SQL string interpolation:

```cit
import database
let mut db = database.connect(":memory:")
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
db.run("INSERT INTO users (name) VALUES (?)", ["Ada"])
let users = db.all("SELECT id, name FROM users WHERE name = ?", ["Ada"])
println(users[0].name)
db.close()
```

SQLite requires a Node.js runtime with `node:sqlite` (Node.js 22.5 or later). `sys.exit()` stops the current CIT program without terminating VS Code or the Node.js host. `sys.isAdmin()` returns `null` where administrator status cannot be determined. Clipboard access is provided in VS Code; it is unavailable in the standalone CLI. Process execution/termination (`sys.exec`, `sys.run`, `sys.kill`) and signal/raw-mode APIs are intentionally unavailable. Password input is hidden in the VS Code runner and disabled in the standalone CLI.

Previous: [20. CIT terminal and editor](20-terminal-and-editor.md) | [Back to the guide](README.md)
