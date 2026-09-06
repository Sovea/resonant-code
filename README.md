# Stetra

**Let the Agent implement. Keep the engineering thread and the final say.**

Stetra helps developers delegate coding work while retaining direction,
engineering understanding, and authority. It connects requests, engineering
choices, observed changes, and analysis inside the coding workflow.

## Install

Install the published package with Node.js 22 or later:

```sh
npm install --global @sovea/stetra
```

To use this checkout, follow [local installation](CONTRIBUTING.md#local-installation).

## Use

Initialize Stetra in your project:

```sh
cd /path/to/project
stetra init .
```

Start a new Codex session and ask it to use Stetra for the task. Review the
result, evidence, and open questions, then accept it or request changes.
Use `stetra status .` to find unfinished work after an interruption.
