from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_ROOT = REPO_ROOT / "docs"
REQUIRED_KEYS = ("source_of_truth", "last_verified_at", "owned_by", "derived_from")


@dataclass
class DocFrontmatter:
    values: dict[str, object]


def parse_frontmatter(path: Path) -> DocFrontmatter | None:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        return None

    values: dict[str, object] = {}
    index = 1
    current_list_key: str | None = None
    current_list: list[str] = []

    while index < len(lines):
        line = lines[index].rstrip()
        if line.strip() == "---":
            if current_list_key is not None:
                values[current_list_key] = current_list[:]
            return DocFrontmatter(values)

        stripped = line.strip()
        if current_list_key is not None and stripped.startswith("- "):
            current_list.append(stripped[2:].strip())
            index += 1
            continue

        if current_list_key is not None:
            values[current_list_key] = current_list[:]
            current_list_key = None
            current_list = []

        if ":" not in line:
            index += 1
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if not value:
            current_list_key = key
            current_list = []
        else:
            values[key] = value
        index += 1

    return None


def validate_doc(path: Path) -> list[str]:
    errors: list[str] = []
    frontmatter = parse_frontmatter(path)
    if frontmatter is None:
        return [f"{path.relative_to(REPO_ROOT)}: missing frontmatter block"]

    for key in REQUIRED_KEYS:
        if key not in frontmatter.values:
            errors.append(f"{path.relative_to(REPO_ROOT)}: missing `{key}`")

    verified_at = frontmatter.values.get("last_verified_at")
    if isinstance(verified_at, str):
        try:
            date.fromisoformat(verified_at)
        except ValueError:
            errors.append(
                f"{path.relative_to(REPO_ROOT)}: `last_verified_at` must be YYYY-MM-DD"
            )

    derived_from = frontmatter.values.get("derived_from")
    derived_items: list[str]
    if isinstance(derived_from, str):
        derived_items = [derived_from]
    elif isinstance(derived_from, list):
        derived_items = [str(item) for item in derived_from]
    else:
        derived_items = []
        errors.append(f"{path.relative_to(REPO_ROOT)}: `derived_from` must be a list")

    for item in derived_items:
        if item.startswith("http://") or item.startswith("https://"):
            continue
        candidate = REPO_ROOT / item
        if not candidate.exists():
            errors.append(
                f"{path.relative_to(REPO_ROOT)}: derived path does not exist -> {item}"
            )

    return errors


def main() -> int:
    errors: list[str] = []
    for path in sorted(DOCS_ROOT.rglob("*.md")):
        errors.extend(validate_doc(path))

    if errors:
        print("Documentation validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Documentation validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
