from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from agent_browser_vision.cli import main


def _write_blank(path: Path) -> None:
    image = np.full((40, 60, 3), 255, dtype=np.uint8)
    cv2.imwrite(str(path), image)


def test_cli_inspect_json(tmp_path: Path, capsys) -> None:
    image_path = tmp_path / "blank.png"
    _write_blank(image_path)

    exit_code = main(["inspect", str(image_path), "--json"])
    captured = capsys.readouterr()

    assert exit_code == 0
    payload = json.loads(captured.out)
    assert payload["width"] == 60
    assert payload["height"] == 40
    assert "blankScore" in payload