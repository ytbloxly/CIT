# 18. UI and text files

## A basic HTML-style UI

The built-in `ui` module creates a small set of HTML-like elements. In VS Code, `.render()` opens the result in a webview beside the editor:

```cit
import ui

fn app(ui.title = "My App") {
    return [
        ui.h1("Hello World!"),
        ui.p("Hello World in paragraph!")
    ]
}

app().render()
```

Available elements: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `title`, `header` and `p`. Their children are rendered as text, not executable HTML.

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

The path is relative to the folder containing the running `.cit` file. `open(path, "read")` can read an existing UTF-8 text file with `file.read()`.

## Try it yourself

1. Add a heading and two paragraphs to the UI.
2. Write a file, then append one more line.

Previous: [17. Functions and built-ins](17-functions-and-builtins.md) | Next: [19. Temporal variables and errors](19-temporal-variables-and-errors.md)
