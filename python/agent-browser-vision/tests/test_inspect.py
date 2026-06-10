from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from agent_browser_vision.inspect import inspect_image


def _write_blank(path: Path) -> None:
    image = np.full((80, 120, 3), 255, dtype=np.uint8)
    cv2.imwrite(str(path), image)


def _write_sharp(path: Path) -> None:
    image = np.zeros((80, 120, 3), dtype=np.uint8)
    cv2.rectangle(image, (10, 10), (110, 70), (0, 180, 255), -1)
    cv2.putText(image, "Agent", (20, 45), cv2.FONT_HERSHEY_SIMPLEX, 1, (20, 20, 20), 2)
    cv2.imwrite(str(path), image)


def _write_blurry(path: Path) -> None:
    sharp = np.zeros((80, 120, 3), dtype=np.uint8)
    cv2.rectangle(sharp, (10, 10), (110, 70), (0, 180, 255), -1)
    cv2.putText(sharp, "Agent", (20, 45), cv2.FONT_HERSHEY_SIMPLEX, 1, (20, 20, 20), 2)
    blurry = cv2.GaussianBlur(sharp, (21, 21), 0)
    cv2.imwrite(str(path), blurry)


def test_blank_image_detection(tmp_path: Path) -> None:
    image_path = tmp_path / "blank.png"
    _write_blank(image_path)

    result = inspect_image(image_path)

    assert result["width"] == 120
    assert result["height"] == 80
    assert result["isLikelyBlank"] is True
    assert result["blankScore"] >= 0.85


def test_blur_score_shape(tmp_path: Path) -> None:
    sharp_path = tmp_path / "sharp.png"
    blurry_path = tmp_path / "blurry.png"
    _write_sharp(sharp_path)
    _write_blurry(blurry_path)

    sharp = inspect_image(sharp_path)
    blurry = inspect_image(blurry_path)

    assert 0.0 <= sharp["blurScore"] <= 1.0
    assert 0.0 <= blurry["blurScore"] <= 1.0
    assert blurry["blurScore"] > sharp["blurScore"]
    assert blurry["isLikelyBlurry"] is True