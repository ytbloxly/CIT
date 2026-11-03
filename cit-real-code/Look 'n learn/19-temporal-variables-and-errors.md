# 19. Temporal variables and errors

## Variables that expire

Add a duration after a variable name:

```cit
let mut shortLived <2s> = "valid for two seconds after the program starts"
let mut temporary <30l> = 3
```

- `<2s>` expires two seconds after the program starts.
- `<30l>` expires after 30 source lines from its declaration. For a declaration on line 4, the value is still available through line 34.

Reading or assigning an expired variable reports an error. Durations must be positive whole numbers; supported units are `s` and `l`.

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

Previous: [18. UI and text files](18-ui-and-files.md) | Next: [20. CIT terminal and editor](20-terminal-and-editor.md)
