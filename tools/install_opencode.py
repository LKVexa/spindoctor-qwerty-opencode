#!/usr/bin/env python3
# SpinDoctor Qwerty 1.1.0 - preserve-and-merge OpenCode installer
# Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
# SPDX-License-Identifier: GPL-3.0-or-later
# This program is free software under GPL version 3 or later; see LICENSE. WITHOUT ANY WARRANTY.
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

SOURCE = Path(__file__).resolve().parents[1]
VERSION = "1.19.0"
AUTHOR = "RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>"
HEADER = "// SpinDoctor Qwerty 1.1.0\n// Copyright (C) 2026 " + AUTHOR + "\n// SPDX-License-Identifier: GPL-3.0-or-later\n"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(value):
    return (json.dumps(value, indent=2) + "\n").encode("utf-8")

def load(path):
    value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if not isinstance(value, dict):
        raise ValueError(str(path.name) + " must contain a JSON object")
    return value

def owned(root, relative):
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError("Invalid owned-file path")
    result = (root / rel).resolve()
    if root != result and root not in result.parents:
        raise ValueError("Owned-file path escapes config directory")
    return result

def install(config, options):
    record_path = owned(config, "spindoctor-qwerty/install-record.json")
    if record_path.exists():
        raise ValueError("SpinDoctor is already installed here. Uninstall the owned files before upgrading.")
    data = {}
    for directory in ("engine", "lib", "plugins"):
        for item in sorted((SOURCE / directory).rglob("*")):
            if item.is_symlink():
                raise ValueError("Symlinks are not supported in the installation payload")
            if item.is_file():
                data["spindoctor-qwerty/" + item.relative_to(SOURCE).as_posix()] = item.read_bytes()
    for name in ("package.json", "README.md", "FUNCTIONS.md", "LICENSE", "NOTICE", "COPYRIGHT", "CHANGELOG.md", "E2E_RESULTS.md"):
        data["spindoctor-qwerty/" + name] = (SOURCE / name).read_bytes()
    state = {"version": "1.1.0", "mode": options.mode, "files": {}, "changes": {}}
    data["skills/spindoctor-qwerty/SKILL.md"] = (SOURCE / "skills/spindoctor-qwerty/SKILL.md").read_bytes()
    if options.mode == "native":
        data["plugins/spindoctor-qwerty.js"] = (SOURCE / "plugins/spindoctor-qwerty.js").read_text(encoding="utf-8").replace("'../lib/native.js'", "'../spindoctor-qwerty/lib/native.js'").encode("utf-8")
        package_path = owned(config, "package.json")
        package = load(package_path)
        dependencies = package.setdefault("dependencies", {})
        if not isinstance(dependencies, dict):
            raise ValueError("Config package.json dependencies must be an object")
        existing = dependencies.get("@opencode-ai/plugin")
        if existing not in (None, VERSION):
            raise ValueError("Existing @opencode-ai/plugin dependency differs from 1.19.0; preserve it and use a separate project config.")
        if existing is None:
            state["changes"]["dependencyAdded"] = True
            dependencies["@opencode-ai/plugin"] = VERSION
        if not package_path.exists():
            package.update({"name": "opencode-spindoctor-config", "version": "1.1.0", "type": "module", "private": True,
                            "license": "GPL-3.0-or-later", "author": AUTHOR})
            state["changes"]["packageCreated"] = True
        changed_json = {"package.json": encoded(package)} if state["changes"].get("dependencyAdded") or state["changes"].get("packageCreated") else {}
    else:
        if owned(config, "opencode.jsonc").exists():
            raise ValueError("Preserve existing opencode.jsonc. Use a separate config directory or merge the MCP entry manually.")
        config_path = owned(config, "opencode.json")
        settings = load(config_path)
        mcp = settings.setdefault("mcp", {})
        if not isinstance(mcp, dict) or "spindoctor-qwerty" in mcp:
            raise ValueError("Existing MCP entry conflicts; preserve it and use a separate config directory.")
        command = [options.python] + options.python_arg + ["-B", str(config / "spindoctor-qwerty/engine/scripts/spindoctor_mcp.py")]
        server = {"type": "local", "command": command, "enabled": True, "timeout": 600000}
        if options.workspace:
            server["environment"] = {"SPINDOCTOR_WORKSPACE": str(Path(options.workspace).resolve()), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1"}
        mcp["spindoctor-qwerty"] = server
        state["changes"]["mcpAdded"] = server
        state["changes"]["configCreated"] = not config_path.exists()
        changed_json = {"opencode.json": encoded(settings)}
    # Preflight all owned paths before writing anything; existing user files are never overwritten.
    owned(config, "spindoctor-qwerty/install-record.json")
    for relative in changed_json:
        owned(config, relative)
    for relative in data:
        if owned(config, relative).exists():
            raise ValueError("Existing file would be overwritten: " + relative)
    for relative, value in data.items():
        target = owned(config, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value)
        state["files"][relative] = digest(value)
    for relative, value in changed_json.items():
        target = owned(config, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value)
        state["changes"][relative + "Hash"] = digest(value)
    record_path.write_bytes(encoded(state))
    print("Installed SpinDoctor 1.1.0 (" + options.mode + ") in " + str(config))
    if options.mode == "native":
        print("OpenCode will install the config directory's declared SDK dependency at startup.")

def uninstall(config):
    record_path = owned(config, "spindoctor-qwerty/install-record.json")
    state = load(record_path)
    if state.get("version") != "1.1.0" or state.get("mode") not in ("native", "mcp"):
        raise ValueError("No valid SpinDoctor installation record here")
    for relative, expected in state["files"].items():
        if not (relative.startswith("spindoctor-qwerty/") or relative in ("plugins/spindoctor-qwerty.js", "skills/spindoctor-qwerty/SKILL.md")):
            raise ValueError("Installation record contains an unowned file; preserving all files")
        target = owned(config, relative)
        if target.exists() and digest(target.read_bytes()) != expected:
            raise ValueError("Owned file changed; preserving installation: " + relative)
    changes = state["changes"]
    edited = {}
    if changes.get("dependencyAdded"):
        package_path = owned(config, "package.json")
        package = load(package_path)
        if package.get("dependencies", {}).get("@opencode-ai/plugin") != VERSION:
            raise ValueError("Owned SDK dependency changed; preserving installation")
        if changes.get("packageCreated") and digest(package_path.read_bytes()) == changes["package.jsonHash"]:
            edited[package_path] = None
        else:
            del package["dependencies"]["@opencode-ai/plugin"]
            edited[package_path] = encoded(package)
    if changes.get("mcpAdded"):
        config_path = owned(config, "opencode.json")
        settings = load(config_path)
        if settings.get("mcp", {}).get("spindoctor-qwerty") != changes["mcpAdded"]:
            raise ValueError("Owned MCP entry changed; preserving installation")
        if changes.get("configCreated") and digest(config_path.read_bytes()) == changes["opencode.jsonHash"]:
            edited[config_path] = None
        else:
            del settings["mcp"]["spindoctor-qwerty"]
            edited[config_path] = encoded(settings)
    # Delete only individually checked owned files. Keep directories and unrelated files.
    for relative in state["files"]:
        owned(config, relative).unlink(missing_ok=True)
    for target, value in edited.items():
        if value is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(value)
    record_path.unlink()
    print("Removed unchanged owned SpinDoctor files; preserved other configuration and files.")

def main():
    parser = argparse.ArgumentParser(description="Install native SpinDoctor tools or an alternative MCP route without replacing existing user configuration.")
    parser.add_argument("action", choices=("install", "uninstall"))
    parser.add_argument("--scope", choices=("project", "global"), default="project")
    parser.add_argument("--project", default=os.getcwd())
    parser.add_argument("--config-dir", help="Explicit config directory, useful for isolated profiles")
    parser.add_argument("--mode", choices=("native", "mcp"), default="native")
    parser.add_argument("--python", default=sys.executable, help="MCP Python executable; arguments use --python-arg")
    parser.add_argument("--python-arg", action="append", default=[])
    parser.add_argument("--workspace", help="Optional persistent MCP workspace")
    options = parser.parse_args()
    config = Path(options.config_dir).resolve() if options.config_dir else (Path(options.project).resolve() / ".opencode" if options.scope == "project" else Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "opencode").resolve()
    if config == SOURCE or SOURCE in config.parents:
        parser.error("Install outside the release checkout so source files remain unchanged")
    try:
        install(config, options) if options.action == "install" else uninstall(config)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print("Installation stopped: " + str(error), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
