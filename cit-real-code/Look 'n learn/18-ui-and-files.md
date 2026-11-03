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

Available elements: `h1` through `h6`, `title`, `header`, `p`, `button`, `slider`, `div`, `select`, `option`, `tile` and `input`. Named arguments become HTML attributes:

```cit
ui.input(type = "email", required, min = 12, max = 24)
ui.button("Continue", class = "primary")
```

Children are rendered as escaped text, not executable HTML. The preview intentionally does not run scripts or event handlers.

## Style a UI

Define a style by giving a function a `style.title`, connect it from the app function, and return selector blocks:

```cit
import ui-style

fn app(ui.title = "Styled App") {
    style.connect("myStyle")
    return [ui.h1("A styled heading")]
}

fn myStyle(style.title = "myStyle") {
    return [
        body {
            backgroundColor = "#f4f4f4"
            textColor = "#222222"
        }
        h1 {
            fontSize = 32
        }
    ]
}

app().render()
```

The renderer accepts a limited, sanitized CSS-like property set. Length values such as `fontSize`, `padding`, `width` and `height` are expressed as numbers or CSS strings.

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
