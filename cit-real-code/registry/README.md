# ipcit registry

Packages for `ipcit install <name>` live here. To add one, create:

    registry/packages/<name>/<version>/ipcit.json
    registry/packages/<name>/<version>/main.cit

`ipcit.json` for a package:

    {
      "name": "<name>",
      "version": "<version>",
      "description": "What it does",
      "main": "main.cit",
      "dependencies": {}
    }

Everything the package declares at the top level (functions, classes, variables) can be used
by the importer: `import "<name>"` then `<name>.someFunction()`.
Package names use lowercase letters, digits, `.`, `-` and `_`.
