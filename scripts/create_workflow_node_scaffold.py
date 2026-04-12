from __future__ import annotations

import argparse
import re
from pathlib import Path
from textwrap import dedent


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "tmp" / "workflow-node-scaffolds"

CATEGORY_CHOICES = ("source", "preprocess", "split", "inference", "postprocess")
RUNTIME_KIND_CHOICES = ("source", "transform", "inference", "export")


def _slugify(node_type: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", node_type).strip("-").lower()
    return slug or "workflow-node"


def _write_file(path: Path, content: str, *, dry_run: bool) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _scaffold_readme(args: argparse.Namespace, output_dir: Path) -> str:
    return dedent(
        f"""\
        # Workflow Node Scaffold

        This scaffold pack was generated for `{args.node_type}`.

        ## Requested Metadata

        - Label: `{args.label}`
        - Category: `{args.category}`
        - Runtime kind: `{args.runtime_kind}`
        - Output directory: `{output_dir}`

        ## Files

        - `catalog-entry.py.snippet`: base `WorkflowCatalogItem(...)` entry
        - `catalog-contracts.py.snippet`: `_catalog_contract_metadata(...)` branch
        - `catalog-extensions.py.snippet`: `_catalog_extension_metadata(...)` branch
        - `runtime-handler.py.snippet`: runtime execution and preview placeholders
        - `mock-entry.ts.snippet`: frontend mock catalog entry
        - `checklist.md`: completion checklist

        ## Next Steps

        1. Fill the TODOs in the generated snippets.
        2. Merge the snippets into the real files.
        3. Run `python .\\scripts\\validate_workflow_nodes.py`.
        4. Run the checks listed in `checklist.md`.
        """
    )


def _catalog_entry_snippet(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        WorkflowCatalogItem(
            type="{args.node_type}",
            label="{args.label}",
            category="{args.category}",
            description="TODO: describe what this node does.",
            runtime_kind="{args.runtime_kind}",
            supported_tasks=["TODO_task"],
            tags=["todo"],
            inputs=[
                _port(
                    "input",
                    "Input",
                    "table",
                    required=True,
                    description="TODO: describe the required upstream input.",
                ),
            ],
            outputs=[
                _port(
                    "result",
                    "Result",
                    "table",
                    description="TODO: describe the main output.",
                ),
            ],
            params=[
                _param(
                    "exampleParam",
                    "Example Param",
                    "text",
                    description="TODO: describe this parameter.",
                    placeholder="TODO",
                ),
            ],
        ),
        """
    )


def _catalog_contract_snippet(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        if node_type == "{args.node_type}":
            return {{
                "input_contracts": [
                    _contract(
                        "input",
                        "TODO: explain what the input must contain.",
                        dataset_kinds=["table"],
                        file_formats=["csv"],
                        notes=["TODO"],
                    ),
                ],
                "output_contracts": [
                    _contract(
                        "result",
                        "TODO: explain what the node outputs.",
                        dataset_kinds=["table"],
                        file_formats=["csv"],
                        notes=["TODO"],
                    ),
                ],
                "example_inputs": [
                    _example(
                        "TODO example input",
                        "json",
                        content=json.dumps({{"TODO": "replace me"}}, indent=2),
                    ),
                ],
                "example_outputs": [
                    _example(
                        "TODO example output",
                        "text",
                        port_key="result",
                        content="TODO: describe a representative output handle or summary.",
                    ),
                ],
                "common_errors": [
                    "TODO: list the most common validation failure.",
                    "TODO: list the most common runtime failure.",
                ],
            }}
        """
    )


def _catalog_extension_snippet(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        if node_type == "{args.node_type}":
            return {{
                "starter_bindings": [
                    # Example:
                    # _starter_binding(
                    #     "dataset_version",
                    #     "datasetVersionId",
                    #     auto_create=False,
                    #     priority=10,
                    # ),
                ],
                "output_behaviors": [
                    # Example:
                    # _output_behavior(
                    #     "result",
                    #     preview_kinds=["dataset_version"],
                    #     usages=[
                    #         _output_usage("workflow", "dataset_version"),
                    #         _output_usage("spatial", "asset_version"),
                    #     ],
                    # ),
                ],
            }}
        """
    )


def _runtime_snippet(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        # Add execution support for `{args.node_type}` in backend/src/platform_backend/workflows/tabular_runtime.py

        if node_type == "{args.node_type}":
            # TODO: resolve bound inputs first, then fall back to params if applicable.
            # TODO: validate the incoming payload and raise ValueError on invalid input.
            # TODO: return a structured output dict keyed by your output port names.
            raise NotImplementedError("{args.node_type} runtime is not implemented yet.")

        # If this node emits a reusable asset or capability:
        # - serialize it with a structured preview kind
        # - include next_actions handoffs
        # - avoid UI-only reconstruction of ids
        """
    )


def _mock_entry_snippet(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        {{
          type: '{args.node_type}',
          label: '{args.label}',
          category: '{args.category}',
          description: 'TODO: describe what this node does.',
          runtimeKind: '{args.runtime_kind}',
          supportedTasks: ['TODO_task'],
          tags: ['todo'],
          inputs: [
            {{
              key: 'input',
              label: 'Input',
              dataTypes: ['table'],
              required: true,
            }},
          ],
          outputs: [
            {{
              key: 'result',
              label: 'Result',
              dataTypes: ['table'],
            }},
          ],
          params: [
            {{
              key: 'exampleParam',
              label: 'Example Param',
              fieldType: 'text',
            }},
          ],
          starterBindings: [
            // TODO: keep this in sync with backend starter_bindings.
          ],
          outputBehaviors: [
            // TODO: keep this in sync with backend output_behaviors.
          ],
        }},
        """
    )


def _checklist(args: argparse.Namespace) -> str:
    return dedent(
        f"""\
        # Completion Checklist

        Node: `{args.node_type}`

        - Extend shared types only if a genuinely new reusable kind is required.
        - Add the catalog entry in `backend/src/platform_backend/workflows/catalog.py`.
        - Fill both `_catalog_contract_metadata(...)` and `_catalog_extension_metadata(...)`.
        - Implement runtime execution and preview serialization in `backend/src/platform_backend/workflows/tabular_runtime.py`.
        - Update `apps/web/src/mocks/platform.ts`.
        - Update or add frontend tests for draft handoff or page handoff when starter behavior changes.
        - Confirm preview outputs expose `nextActions` when the node emits reusable results.
        - Run `python .\\scripts\\validate_workflow_nodes.py`.
        - Run `npm run lint --workspace @platform/web`.
        - Run `npm run test --workspace @platform/web`.
        - Run `npm run build --workspace @platform/web`.
        - Run `python .\\scripts\\validate_docs.py`.
        - Run `python -m ruff check backend/src backend/tests`.
        - Run `python -m pytest backend/tests`.
        """
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a scaffold pack for a new workflow node."
    )
    parser.add_argument("--node-type", required=True, help="Node type, for example custom.my_node")
    parser.add_argument("--label", required=True, help="Display label for the node")
    parser.add_argument(
        "--category",
        choices=CATEGORY_CHOICES,
        default="preprocess",
        help="Workflow node category",
    )
    parser.add_argument(
        "--runtime-kind",
        choices=RUNTIME_KIND_CHOICES,
        default="transform",
        help="Workflow runtime kind",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where the scaffold pack will be created",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing scaffold directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the target directory without writing files",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    output_root = Path(args.output_dir)
    output_dir = output_root / _slugify(args.node_type)

    if output_dir.exists() and not args.force:
        parser.error(
            f"Scaffold directory already exists: {output_dir}. Use --force to overwrite it."
        )

    files = {
        "README.md": _scaffold_readme(args, output_dir),
        "catalog-entry.py.snippet": _catalog_entry_snippet(args),
        "catalog-contracts.py.snippet": _catalog_contract_snippet(args),
        "catalog-extensions.py.snippet": _catalog_extension_snippet(args),
        "runtime-handler.py.snippet": _runtime_snippet(args),
        "mock-entry.ts.snippet": _mock_entry_snippet(args),
        "checklist.md": _checklist(args),
    }

    if not args.dry_run and output_dir.exists() and args.force:
        for existing in output_dir.iterdir():
            if existing.is_file():
                existing.unlink()

    for file_name, content in files.items():
        _write_file(output_dir / file_name, content, dry_run=args.dry_run)

    print(f"Workflow node scaffold target: {output_dir}")
    if args.dry_run:
        print("Dry run only. No files were written.")
    else:
        print(f"Created {len(files)} scaffold files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
