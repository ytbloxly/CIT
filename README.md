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

## Defaults, styling, inputs, switch and try (v0.6)

```
import ui;
import ui-style;

ui.root main(name="Body", title="Form" style-connect="styler()")
    ui email -> ui.input(type="email" required) = "you@example.com";   # type, minLength, maxLength, required
    ui send -> ui.button(id="Send", class="button") = "Send";
end;

ui.style styler()                                  # selectors: id.X  name.X  class.X  ui.<element>  uni
    id.Send {
        background-color = color("blue");          # color("name") rgb() rgba() hsl() hwb() hex("ff8800")
        text-color = hsl(0, 0, 100);
        border = px(2), solid, color("white");     # size, type, color
        font-family = "Arial", sans-serif;
        width = px(200);                           # px() per() vh() vw() pt() em() rem() cm() in()
    };
    ui.button, ui.h2 {};
end;

void main()
    email.focus(func f() ... end);                 # inputs: focus, focusEnd, typed;  a && b && c.typed(...)
    func add(a = 1, b) do                          # default values; add(a, 2) uses a's default
        return a + b;
    end;

    switch (add(a, 2)) do                          # break; leaves the switch
        case 3, 4 do
            console.write("three or four");
        end;
        default do
            console.write("other");
        end;
    end;

    try do
        default num x = 1 / 0;
    catch (err) do                                 # except works the same as catch
        console.write(f"{err.name}: {err.message}");
    finally do
        console.write("always");
    end;
end;
```

* Input properties: `.value` (typed text, can be set), `.placeholder`, `.valid`.
* In `catch`, `err` has `.name`, `.message` and `.line`. `return error.X;` is an exit and is not caught.

## States, math, sets, built-ins and strings (v0.7)

```
import ui;
import ui-style;
import math as m;                                 # math.pi works too

ui.root main(title="App" style-connect="styler()")
    ui my_button -> ui.button(id="Click") = "Click me!";
end;

ui.style styler()
    id.Click { background-color = color("yellow"); display = flexbox; margin = px(8), px(16); border-corner = px(6); };
    id.Click.hover() { transform = scale(1.1); };        # states: hover(), hoverEnd(), active(), clicked()
    id.Click.active() { background-color = color("red"); };
end;
# more tags: display, margin, padding, border-corner, position, transform = translate(px(1), px(2)), rotate(10), scale(1.2), skew(5)

void main()
    my_button.hover(func h() ... end);                # events: hover, hoverEnd, active (+ clicked, focus, ...)

    when (n) do
        (n > 5) is console.write("big");              # `is` (>> still works)
        else is console.write("small");
    end;

    default num r = math.sqrt(16);                    # ceiling floor trunc sqrt cbrt power log log10 sin cos tan degrees radians factorial gcd fabs
    default list s = {1, 2, 2, 3};                    # set: add discard remove has clear | & - ^
    default ? anything = Null;                        # optional: any type
    console.write(type(s), len(s), max(3, 9), isinstance(b, Person), issubclass(Builder, Person));
    list("abc");  set([1, 1]);  tuple([1, 2]);

    default string str = "Hello";
    str.toUpperCase();                                # as a statement it changes the variable
    console.write(str.replace("L" => "l"));           # in an expression it only returns a new string
end;
```

* String methods: `toUpperCase`, `toLowerCase`, `replace("old" => "new")`, `includes`, `startsWith`, `endsWith`, `substring(start, end)`.
* `type()` gives `num`, `string`, `bool`, `Null`, `list`, `tuple`, `set`, `dict`, a class name or an enum name.
