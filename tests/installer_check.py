#!/usr/bin/env python3
# Preserve/merge, conflict and owned-uninstall checks against fresh isolated configurations.
# Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
# SPDX-License-Identifier: GPL-3.0-or-later
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

RELEASE = Path(__file__).resolve().parents[1]
INSTALLER = RELEASE / "tools/install_opencode.py"
checks = []
skipped = []
temporary = Path(tempfile.mkdtemp(prefix="spindoctor-opencode-installer-"))

def check(name, passed, detail=None):
    item = {"name": name, "pass": bool(passed)}
    if detail is not None:
        item["detail"] = detail
    checks.append(item)
    print(("PASS " if passed else "FAIL ") + name)

def run(action, config, *arguments):
    return subprocess.run([sys.executable, "-B", str(INSTALLER), action, "--config-dir", str(config)] + list(arguments),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8",
                          env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONUTF8="1", SPINDOCTOR_WORKSPACE=str(temporary / "never-created-workspace")))

def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def snapshot(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}

try:
    config = temporary / "project with spaces/.opencode"
    original = {"name": "existing-config", "license": "MIT", "custom": {"keep": True}, "dependencies": {"another": "7"}}
    write(config / "package.json", json.dumps(original))
    write(config / "plugins/other.js", "// unrelated plugin\n")
    result = run("install", config)
    check("native installation succeeds with project path spaces", result.returncode == 0, result.stderr)
    installed = json.loads((config / "package.json").read_text())
    check("existing package fields and other dependencies preserved", all(installed[key] == value for key, value in original.items() if key != "dependencies") and installed["dependencies"] == {"another": "7", "@opencode-ai/plugin": "1.19.0"})
    check("unrelated plugin bytes preserved", (config / "plugins/other.js").read_text() == "// unrelated plugin\n")
    check("install starts no engine workspace", not (temporary / "never-created-workspace").exists())
    check("installation carries exact 35 approved engine files", snapshot(config / "spindoctor-qwerty/engine") == snapshot(RELEASE / "engine") and len(snapshot(RELEASE / "engine")) == 35)
    entry = (config / "plugins/spindoctor-qwerty.js").read_text()
    check("generated native entry exports only owned factory and imports config SDK", 'export const SpinDoctorQwerty' in entry and "from '@opencode-ai/plugin'" in entry and "from '../spindoctor-qwerty/lib/native.js'" in entry)
    result = run("uninstall", config)
    remaining = json.loads((config / "package.json").read_text())
    check("uninstall removes added dependency and preserves existing package", result.returncode == 0 and remaining == original and (config / "plugins/other.js").exists())
    check("uninstall removes only owned files", not (config / "plugins/spindoctor-qwerty.js").exists() and not (config / "spindoctor-qwerty/engine/scripts/spindoctor_cli.py").exists())

    modified = temporary / "modified"
    assert run("install", modified).returncode == 0
    write(modified / "plugins/spindoctor-qwerty.js", "// user edited owned file\n")
    before = snapshot(modified)
    result = run("uninstall", modified)
    check("modified owned files block uninstall without any deletion", result.returncode != 0 and before == snapshot(modified))

    conflict = temporary / "conflict"
    write(conflict / "plugins/spindoctor-qwerty.js", "// existing user file\n")
    write(conflict / "package.json", json.dumps(original))
    before = snapshot(conflict)
    result = run("install", conflict)
    check("owned-file conflict rejects before writes", result.returncode != 0 and snapshot(conflict) == before)

    dependency = temporary / "dependency-conflict"
    write(dependency / "package.json", '{"dependencies":{"@opencode-ai/plugin":"older"}}')
    before = snapshot(dependency)
    result = run("install", dependency)
    check("different existing SDK pin rejects before writes", result.returncode != 0 and snapshot(dependency) == before)

    matching = temporary / "matching-dependency"
    exact = '{"custom":true,"dependencies":{"@opencode-ai/plugin":"1.19.0"}}'
    write(matching / "package.json", exact)
    result = run("install", matching)
    check("matching existing SDK package bytes unchanged", result.returncode == 0 and (matching / "package.json").read_text() == exact)
    result = run("uninstall", matching)
    check("preexisting SDK dependency survives uninstall unchanged", result.returncode == 0 and (matching / "package.json").read_text() == exact)

    global_config = temporary / "global config"
    result = run("install", global_config, "--scope", "global")
    check("explicit isolated global config installation succeeds", result.returncode == 0 and (global_config / "skills/spindoctor-qwerty/SKILL.md").exists())
    package = json.loads((global_config / "package.json").read_text())
    check("fresh package metadata has full author GPL and version", package["author"] == "RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>" and package["license"] == "GPL-3.0-or-later" and package["version"] == "1.1.0")
    xdg = temporary / "xdg-global"
    global_environment = dict(os.environ, XDG_CONFIG_HOME=str(xdg), PYTHONDONTWRITEBYTECODE="1", PYTHONUTF8="1")
    result = subprocess.run([sys.executable, "-B", str(INSTALLER), "install", "--scope", "global"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", env=global_environment)
    check("default global selection respects isolated XDG_CONFIG_HOME", result.returncode == 0 and (xdg / "opencode/plugins/spindoctor-qwerty.js").is_file())

    mcp = temporary / "mcp config"
    original_mcp = {"model": "existing/model", "mcp": {"other": {"type": "local", "command": ["example"]}}}
    write(mcp / "opencode.json", json.dumps(original_mcp))
    result = run("install", mcp, "--mode", "mcp", "--python", sys.executable, "--python-arg=-X", "--python-arg=utf8", "--workspace", str(temporary / "mcp workspace"))
    settings = json.loads((mcp / "opencode.json").read_text())
    server = settings["mcp"]["spindoctor-qwerty"]
    check("MCP install preserves unrelated configuration", result.returncode == 0 and settings["model"] == original_mcp["model"] and settings["mcp"]["other"] == original_mcp["mcp"]["other"])
    check("MCP generated command has separate executable arguments and real absolute script", server["command"] == [sys.executable, "-X", "utf8", "-B", str(mcp / "spindoctor-qwerty/engine/scripts/spindoctor_mcp.py")] and Path(server["command"][-1]).is_file())
    check("MCP generated workspace and timeout usable", Path(server["environment"]["SPINDOCTOR_WORKSPACE"]).is_absolute() and server["timeout"] == 600000)
    check("MCP route preserves the skill without a native entry or SDK dependency", not (mcp / "plugins/spindoctor-qwerty.js").exists() and not (mcp / "package.json").exists() and "spindoctor-qwerty_spindoctor_functions" in (mcp / "skills/spindoctor-qwerty/SKILL.md").read_text())
    result = run("uninstall", mcp)
    check("MCP uninstall preserves other settings and server", result.returncode == 0 and json.loads((mcp / "opencode.json").read_text()) == original_mcp)

    jsonc = temporary / "jsonc"
    write(jsonc / "opencode.jsonc", '{\n// keep this comment\n"model":"existing/model"\n}\n')
    before = snapshot(jsonc)
    result = run("install", jsonc, "--mode", "mcp")
    check("JSONC is preserved and installation stops before writes", result.returncode != 0 and snapshot(jsonc) == before)

    existing_mcp = temporary / "existing-mcp"
    write(existing_mcp / "opencode.json", '{"mcp":{"spindoctor-qwerty":{"type":"local","command":["existing"]}}}')
    before = snapshot(existing_mcp)
    result = run("install", existing_mcp, "--mode", "mcp")
    check("existing named MCP server preserved without writes", result.returncode != 0 and snapshot(existing_mcp) == before)

    record = global_config / "spindoctor-qwerty/install-record.json"
    invalid = json.loads(record.read_text())
    invalid["files"]["spindoctor-qwerty/../../outside.txt"] = "unused"
    record.write_text(json.dumps(invalid))
    before = snapshot(global_config)
    result = run("uninstall", global_config)
    check("traversal in an altered ownership record rejected before deletion", result.returncode != 0 and snapshot(global_config) == before)

    external = temporary / "external-package.json"
    write(external, json.dumps(original))
    linked = temporary / "linked-config"
    linked.mkdir()
    try:
        os.symlink(external, linked / "package.json")
    except OSError as error:
        skipped.append({"name": "external config symlink containment", "reason": "OS denied creating a test symlink: " + str(error)})
    else:
        external_before = external.read_bytes()
        result = run("install", linked)
        check("external package symlink rejects before payload writes", result.returncode != 0 and external.read_bytes() == external_before and not (linked / "spindoctor-qwerty").exists())

    summary = {"passed": sum(item["pass"] for item in checks), "total": len(checks), "checks": checks, "skipped": skipped, "python": sys.version.split()[0]}
    if len(sys.argv) > 1:
        Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)
        Path(sys.argv[1]).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    exit_code = 0 if summary["passed"] == summary["total"] else 1
finally:
    if temporary.resolve().parent != Path(tempfile.gettempdir()).resolve() or not temporary.name.startswith("spindoctor-opencode-installer-"):
        raise RuntimeError("Unsafe installer test cleanup path")
    shutil.rmtree(temporary)
sys.exit(exit_code)
