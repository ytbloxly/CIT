# 18. Terminal tools and text files

## Terminal helpers

The `cli` module provides menus, confirmation prompts, formatted tables, progress output and cursor controls:

```cit
import cli

let choice = cli.select(["Start", "Settings", "Exit"])
if (choice == 0) {
    println("Starting...")
}

cli.table([
    ["Month", "Sales", "Buyers"],
    ["January", 109, 24],
    ["February", 112, 16]
])

if (cli.confirm("Continue?")) {
    cli.progress(50)
}
```

In the bundled terminal, selection prompts accept the displayed number. `cli.size()` returns terminal dimensions as a dictionary. `cli.clear()` clears the terminal. `cli.password()` hides typed characters in the VS Code runner; it is unavailable in the standalone CLI because standard input cannot guarantee hidden input.

## Save UTF-8 text

Use `write` to create or replace a file and `append` to add to it:

```cit
with open("notes.txt", "write", encoding = "utf-8") as file {
    file.write("First Line.\n")
    file.write("Second Line.\n")
}

with open("notes.txt", "append", encoding = "utf-8") as file {
    file.write("Last Line.\n")
}
```

The path is relative to the folder containing the running `.cit` file. `open(path, "read")` reads an existing UTF-8 text file with `file.read()`.

Previous: [17. Functions and built-ins](17-functions-and-builtins.md) | Next: [19. Temporal variables and errors](19-temporal-variables-and-errors.md)
