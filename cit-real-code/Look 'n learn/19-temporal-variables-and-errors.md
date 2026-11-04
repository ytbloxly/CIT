# 19. Temporal variables and errors

## Variables that expire

Add a duration after a variable name:

```cit
let mut shortLived <2s> = "valid for two seconds after the program starts"
let mut lineScoped <30l> = 3
let mut readLimited <5r> = 10
let mut offlineValue <5s = offline> = 20
let mut inactiveValue <5s = stopUse> = 30
```

- `<2s>` expires two seconds after the program starts.
- `<30l>` expires after 30 source lines from its declaration. For a declaration on line 4, the value is still available through line 34.
- `<5r>` expires after five reads.
- `offline` restarts its timeout on each read and expires after that many seconds without use.
- `stopUse` expires after that many seconds while the VS Code window is inactive. The standalone CLI does not currently have a window-activity signal, so this mode is only effective in VS Code.
- Two limits can be chained, for example `let mut value <3s> after <30l> = 12`; the variable expires when either limit is reached.

Reading or assigning an expired variable reports an error. Durations must be positive whole numbers. `offline` and `stopUse` are only valid with the seconds (`s`) unit.

## Raise and catch typed errors

`raise` names an error type. Use `except` to handle a specific type, `catch` for any error, and `finally` for cleanup that always runs:

```cit
try {
    raise ValueError("That value is not valid.")
} except ValueError as err {
    println(err)
} finally {
    println("Finished checking.")
}
```

Existing `throw value` and `catch (errorName)` remain supported.

## Enums

An enum creates named values from strings:

```cit
let enum colors = ([
    "red",
    "yellow",
    "blue"
])

let red = colors.red
printf("The color is %s", red)
```

Fixed-width numeric and string declarations are range/size checked. Ordinary strings are unbounded unless an `sN` width is explicitly declared; `longString(value)` converts any value to text. `longNumber(value)` still uses a JavaScript number, so it cannot preserve arbitrary-precision integer values.

Previous: [18. Terminal tools and text files](18-terminal-tools-and-files.md) | Next: [20. CIT terminal and editor](20-terminal-and-editor.md)
