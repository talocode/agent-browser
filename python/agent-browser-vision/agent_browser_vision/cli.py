from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .diff import diff_images
from .inspect import inspect_image


def _print_result(result: dict[str, Any], *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, indent=2))
        return

    for key, value in result.items():
        print(f"{key}: {value}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-browser-vision",
        description="Optional screenshot visual inspection for Agent Browser",
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="Output machine-readable JSON")

    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser(
        "inspect",
        parents=[common],
        help="Inspect a screenshot",
    )
    inspect_parser.add_argument("image", help="Path to screenshot image")

    diff_parser = subparsers.add_parser(
        "diff",
        parents=[common],
        help="Compare two screenshots",
    )
    diff_parser.add_argument("before", help="Path to before screenshot")
    diff_parser.add_argument("after", help="Path to after screenshot")
    diff_parser.add_argument("--out", help="Write highlighted diff image to this path")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "inspect":
            result = inspect_image(args.image)
        elif args.command == "diff":
            result = diff_images(args.before, args.after, out=args.out)
        else:
            parser.error(f"Unknown command: {args.command}")
            return 2

        _print_result(result, as_json=args.json)
        return 0
    except (FileNotFoundError, ValueError) as error:
        if args.json:
            print(json.dumps({"ok": False, "error": str(error)}))
        else:
            print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())