# Contributing to CIT (Code Information Technology)

Thank you for your interest in contributing to CIT! Whether you are fixing a VM bug, adding features to the VS Code extension, expanding documentation, or creating packages, your help is highly appreciated.

CIT is designed to be a lightweight, easy-to-learn language. We want our contribution process to be just as smooth.

---

## Project Structure Overview

Before making changes, it helps to understand where everything lives in the repository:
* `runtime/` — The core interpreter, bytecode VM, terminal configurations, and `ipcit` internals.
* `extension.js` & `syntaxes/` & `snippets/` — The VS Code extension logic, grammar files for syntax highlighting, and code snippets.
* `bin/` — Executable CLI tools (`cit` and `ipcit`).
* `examples/` — Sample `.cit` and `.ct` programs used for demonstration and manual testing.

---

## How to Contribute

### 1. Report Bugs or Suggest Features
If you find an issue or have a great idea to make CIT better, please check the **Issues** tab first. If it's not already reported:
* Open a new Issue.
* Provide a clear description of the bug or feature request.
* For bugs, include a minimal reproducible example written in `.cit` along with the unexpected output or terminal error.

### 2. Submitting Code Changes (Pull Requests)
We follow the standard GitHub Fork & Pull Request workflow:

1. **Fork the Repository:** Click the `Fork` button at the top right of this page.
2. **Clone Your Fork:**
   ```bash
   git clone https://github.com
   ```
3. **Create a Feature Branch:** Always work on a separate branch tailored to your fix or feature.
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make and Test Your Changes:** 
   * If you are editing the runtime environment, make sure to manually test your modifications against the scripts inside `examples/`.
   * If you are modifying the VS Code extension, test it locally to ensure the terminal runner (using the Run/Play button or `Ctrl+F5`) still handles execution correctly.
5. **Commit & Push:** Keep your commit messages brief and descriptive.
   ```bash
   git add .
   git commit -m "Fix safe navigation fallback bug in runtime"
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request:** Go to the original CIT repository, navigate to the `Pull Requests` tab, and click `New Pull Request`. Describe your changes clearly in the PR template.

---

## Code and Language Guidelines

* **Simplicity First:** CIT values readability over hyper-performance. Any syntax changes, built-in functions, or method additions must fit our "beginner-friendly" language philosophy.
* **Keep Code Consistent:** Match the formatting styles already present within the JavaScript/Node.js files in `runtime/` and `extension.js`.
* **Cross-Platform Safety:** Ensure all file paths and terminal command abstractions work perfectly on Windows, macOS, and Linux.

---

Thank you for making CIT better for everyone!
