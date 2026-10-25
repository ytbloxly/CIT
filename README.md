# CIT (Code Information Technology)

VS Code support for `.cit` files: syntax colors, error squiggles, auto-closing `end;`, snippets,
a **Run** button (`Ctrl+Alt+R`) that runs your program in a **CIT terminal** (output and `console.input` both live there,
`Ctrl+C` stops it) and a live UI preview.

```
import ui;

ui.root main(name="Body", title="Button Clicker")
    ui my_button -> ui.button(id="Click", class="clicking") = "Click me!";
    ui paragraph -> ui.p(id="Teller") = "Click this button, please!";
    ui output -> ui.codeOutput() = "Output";      # shows everything console.write prints
end;

void main()
    default num clicks = 0;
    my_button.clicked(func click()
        clicks += 1;
        paragraph.text = f"Clicked {clicks.value} time(s)!";
        console.write("You have clicked the button!");
    end);

    main.closed(func closing()                      # runs when the UI window is closed
        console.write(f"You clicked {clicks.value} time(s)");
    end);

    default list array = [1, True, Null, "Hi!"];    # list: can be changed
    array.push("World");                            # push, pop, unshift, shift, splice
    default list tuple = (1, 2, 3);                 # tuple: tuple[0] = 5; is an error
    console.write(array[0]);                        # indexing, array.length
end;

return error.NoErr;
```

* Blocks open with `do` (or `void main()`, `ui.root ...`, `x.clicked(func f()`) and close with `end;` (`end);` for callbacks).
* Types: `num`, `bool`, `string`, `input`, `classIns`, `list`. Values: `True`, `False`, `Null`.
* Logic operators: `&&` (and), `||` (or), `!` (not). The words `and` / `or` / `not` do not exist.
* Classes: `class Child(Parent) do`, `func _init(...)`, `this.x`, `super._init(...)`; methods are chosen by the object's real class (polymorphism).
* Functions and methods without a return value give back `Null`.
* Casting: `parseInt`, `parseFloat`, `parseString`, `parseBool`.
* Errors: `error.NoErr`, `error.Err`, `error.ErrUnknown`, `error.ErrParsedLine`, `error.ErrExample`.
* UI elements: `ui.button`, `ui.p`, `ui.h1`, `ui.h2`, `ui.h3`, `ui.codeOutput`. Events: `.clicked`, root `.closed`.
* Setting: `cit.autoCloseEnd` (default on).

## Tasks, control flow and data (v0.5)

```
void main()
    task.start(ticker()) until task.repeated(5);   # background, starts now, stops after 5 repeats
    task.repeat(ticker(), 4);                      # background, 4 times
    task.start(ticker());                          # background, until task.stop(ticker());

    default num i = 0;
    i++;  ++i;  i--;  --i;                          # steps (numbers only)

    when (i) do                                     # first matching case wins, no new scope
        (i > 5) >> console.write("big");
        (3) >> console.write("three");              # a non-bool case is compared with the subject
        else >> console.write("other");
    end;

    default list info = {name: "Bob", age: 32};     # info.name, info["age"], keys() values() has() remove()
    default enum Directions do
        Directions.North;
        Directions.South;
    end;                                            # Directions[0] -> North, Directions.North -> Directions.0

    raise error.ValueError do                       # runs the block, then ends the program with the error
        console.write("bad value");
    end;
end;

task ticker() do
    console.write("tick");
    task.wait(1);
end;
```

* `break;`, `continue;`, `pass;` and `return;` / `return value;` (inside `func` and `task`; `return error.X;` still ends the program).
* In a task: `continue;` skips to the next repetition, `break;` / `return;` stop the task.
