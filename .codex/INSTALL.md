# Installing Resonant Code for Codex

Enable resonant-code skills in Codex via native skill discovery. Just clone and symlink.

## Prerequisites

- Git

## Installation

1. Clone the repository:

```sh
git clone https://github.com/Sovea/resonant-code.git ~/.codex/resonant-code
```

2. Create the shared dependency links inside the clone.

These skills expect `playbook` and `runtime` to be available next to specific skill directories.

macOS/Linux:

```sh
ln -s ~/.codex/resonant-code/playbook ~/.codex/resonant-code/skills/init/playbook
ln -s ~/.codex/resonant-code/playbook ~/.codex/resonant-code/skills/code/playbook
ln -s ~/.codex/resonant-code/runtime ~/.codex/resonant-code/skills/code/runtime
```

Windows (PowerShell):

```powershell
cmd /c mklink /J "$env:USERPROFILE\.codex\resonant-code\skills\init\playbook" "$env:USERPROFILE\.codex\resonant-code\playbook"
cmd /c mklink /J "$env:USERPROFILE\.codex\resonant-code\skills\code\playbook" "$env:USERPROFILE\.codex\resonant-code\playbook"
cmd /c mklink /J "$env:USERPROFILE\.codex\resonant-code\skills\code\runtime" "$env:USERPROFILE\.codex\resonant-code\runtime"
```

3. Create the native skill discovery symlink.

macOS/Linux:

```sh
mkdir -p ~/.agents/skills
ln -s ~/.codex/resonant-code/skills ~/.agents/skills/resonant-code
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\resonant-code" "$env:USERPROFILE\.codex\resonant-code\plugins\resonant-code\skills"
```

4. Restart Codex to discover the skills.

## Verify

macOS/Linux:

```sh
ls -la ~/.agents/skills/resonant-code
```

Windows (PowerShell):

```powershell
Get-Item "$env:USERPROFILE\.agents\skills\resonant-code" | Format-List FullName,LinkType,Target
```

You should see a symlink or junction pointing to the repository skills directory.

## Updating

```sh
cd ~/.codex/resonant-code && git pull
```

If the shared dependency links were removed or replaced, recreate them using step 2.

Skills update instantly through the symlink.

## Uninstalling

macOS/Linux:

```sh
rm ~/.agents/skills/resonant-code
rm ~/.codex/resonant-code/skills/init/playbook
rm ~/.codex/resonant-code/skills/code/playbook
rm ~/.codex/resonant-code/skills/code/runtime
```

Windows (PowerShell):

```powershell
Remove-Item "$env:USERPROFILE\.agents\skills\resonant-code"
Remove-Item "$env:USERPROFILE\.codex\resonant-code\skills\init\playbook"
Remove-Item "$env:USERPROFILE\.codex\resonant-code\skills\code\playbook"
Remove-Item "$env:USERPROFILE\.codex\resonant-code\skills\code\runtime"
```

Optionally delete the clone:

```sh
rm -rf ~/.codex/resonant-code
```
