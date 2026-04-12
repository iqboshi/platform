from __future__ import annotations

import json
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
MODULES_PATH = REPO_ROOT / "apps" / "web" / "src" / "config" / "workspace-modules.json"
OUTPUT_PATH = REPO_ROOT / "docs" / "generated" / "module-catalog.md"


SECTION_TITLES = {
    "workspace": "Workspace Modules",
    "admin": "Administration Modules",
    "personal": "Personal Modules",
}


def main() -> int:
    modules = json.loads(MODULES_PATH.read_text(encoding="utf-8"))
    today = date.today().isoformat()

    lines: list[str] = [
        "---",
        "source_of_truth: generated",
        f"last_verified_at: {today}",
        "owned_by: platform-web",
        "derived_from:",
        f"  - {MODULES_PATH.relative_to(REPO_ROOT).as_posix()}",
        "---",
        "",
        "# Module Catalog",
        "",
        "This file is generated from the frontend workspace module registry.",
        "",
    ]

    for section in ("workspace", "admin", "personal"):
        section_modules = [item for item in modules if item["section"] == section]
        if not section_modules:
            continue

        lines.append(f"## {SECTION_TITLES[section]}")
        lines.append("")

        for item in section_modules:
            permission = item.get("permission") or "none"
            dashboard = item["dashboard"]
            lines.extend(
                [
                    f"### `{item['id']}`",
                    "",
                    f"- Route: `{item['route']}`",
                    f"- Menu key: `{item['menuLabelKey']}`",
                    f"- Permission: `{permission}`",
                    f"- Summary (ZH): {dashboard['summaryZh']}",
                    f"- Summary (EN): {dashboard['summaryEn']}",
                    "- Cross-page handoff notes:",
                ]
            )

            for note in dashboard["handoffEn"]:
                lines.append(f"  - {note}")

            lines.append("")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
