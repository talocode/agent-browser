from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from agent_browser_vision.diff import diff_images


def _write_image(path: Path, color: tuple[int, int, int]) -> None:
    image = np.full((60, 80, 3), color, dtype=np.uint8)
    cv2.rectangle(image, (10, 10), (70, 50), (255 - color[0], 255 - color[1], 255 - color[2]), 2)
    cv2.imwrite(str(path), image)


def test_diff_same_image_near_zero(tmp_path: Path) -> None:
    image_path = tmp_path / "same.png"
    _write_image(image_path, (30, 90, 200))

    result = diff_images(image_path, image_path)

    assert result["diffScore"] < 0.01
    assert result["changedPixelsPercent"] < 1.0
    assert result["dimensionsMatch"] is True


def test_diff_different_image_greater_than_zero(tmp_path: Path) -> None:
    before = tmp_path / "before.png"
    after = tmp_path / "after.png"
    _write_image(before, (30, 90, 200))
    _write_image(after, (200, 40, 40))

    result = diff_images(before, after, out=tmp_path / "diff.png")

    assert result["diffScore"] > 0.1
    assert result["changedPixelsPercent"] > 10
    assert result["outputPath"] == str(tmp_path / "diff.png")
    assert Path(result["outputPath"]).exists()