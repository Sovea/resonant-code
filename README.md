# Stetra

**Let the Agent implement. Keep the engineering thread and the final say.**

Stetra connects developer direction, engineering decisions during work,
observed changes, semantic assessment, and Human adoption inside coding Hosts.

Its objective is to reduce the total cost from request to confident adoption
without weakening the developer's system understanding or engineering
judgment.

## Install

```sh
npm install --global @sovea/stetra
```

## Use

Initialize Stetra in the repository where the Agent will work:

```sh
cd /path/to/project
stetra init .
stetra status .
```

Codex is the default adapter. To include Claude Code, use
`stetra init . --adapter codex --adapter claude`. Review the generated project
Hooks when the Host requests trust.

Then give the coding task to your Agent as usual. Project admission policy,
generated Host hooks, and one compact Skill apply Stetra only to admitted coding
changes. The visible path is `Align -> Work -> Decide`: the Agent implements
normally within existing authority, records concrete choices and corrections,
and supplies an implementation report. Stetra retains exact Git and Check
facts; a Host Analyzer assesses the frozen result and surfaces findings. You
review the resulting adoption Package and accept, correct, reject, or defer it.

Core and CLI do not call models. Findings and disagreements remain visible;
passing checks are evidence, not adoption. See the
[executable workflow](docs/change-workflow.md) and [architecture](docs/architecture.md).
