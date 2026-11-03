# 20. CIT terminal and editor

## Use `cit` in Command Prompt or PowerShell

The extension bundles the `cit` script. To use it from any Windows terminal, install Node.js and link this project once from its folder:

```text
npm.cmd link
```

`npm.cmd link` also works in Command Prompt and avoids PowerShell's script execution-policy restriction on `npm.ps1`.

Then open the CIT terminal:

```text
cit --open trm
```

At the `cit>` prompt:

- `--crt file --nm main.cit` creates an empty source file.
- `--enter main.cit` runs the file.
- `--dlt main.cit` permanently deletes the file.
- `help` lists terminal commands; `exit` closes the terminal.

The commands also work directly from Command Prompt or PowerShell, for example `cit --enter main.cit`. The existing `cit main.cit` form still runs a program. `ipcit` remains the package-manager command.

## Editor navigation

CIT syntax is highlighted using the active theme. Hover over common keywords and built-ins for a short definition. **Go to Definition** (`Ctrl+Click` or `F12`) navigates to a matching local declaration.

Use `Ctrl+F5` to run a file and the Command Palette command **CIT: Open Look 'n learn (Docs)** to browse these chapters.

Previous: [19. Temporal variables and errors](19-temporal-variables-and-errors.md) | [Back to the guide](README.md)
