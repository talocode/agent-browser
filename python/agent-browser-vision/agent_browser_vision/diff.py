from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .inspect import _load_image


def _resize_to_match(before: np.ndarray, after: np.ndarray) -> tuple[np.ndarray, np.ndarray, bool]:
    before_h, before_w = before.shape[:2]
    after_h, after_w = after.shape[:2]
    dimensions_match = before_w == after_w and before_h == after_h

    if dimensions_match:
        return before, after, True

    target_w = min(before_w, after_w)
    target_h = min(before_h, after_h)
    resized_before = cv2.resize(before, (target_w, target_h), interpolation=cv2.INTER_AREA)
    resized_after = cv2.resize(after, (target_w, target_h), interpolation=cv2.INTER_AREA)
    return resized_before, resized_after, False


def _layout_shift_score(before: np.ndarray, after: np.ndarray) -> float:
    before_gray = cv2.cvtColor(before, cv2.COLOR_BGR2GRAY)
    after_gray = cv2.cvtColor(after, cv2.COLOR_BGR2GRAY)

    before_edges = cv2.Canny(before_gray, 80, 160)
    after_edges = cv2.Canny(after_gray, 80, 160)

    edge_diff = cv2.absdiff(before_edges, after_edges)
    edge_change_ratio = float(np.count_nonzero(edge_diff)) / float(edge_diff.size)

    before_blocks = cv2.resize(before_gray, (8, 8), interpolation=cv2.INTER_AREA)
    after_blocks = cv2.resize(after_gray, (8, 8), interpolation=cv2.INTER_AREA)
    block_mean_shift = float(np.mean(cv2.absdiff(before_blocks, after_blocks))) / 255.0

    score = min(1.0, (edge_change_ratio * 2.5) + (block_mean_shift * 1.5))
    return round(score, 4)


def diff_images(
    before_path: str | Path,
    after_path: str | Path,
    *,
    out: str | Path | None = None,
) -> dict[str, Any]:
    before = _load_image(before_path)
    after = _load_image(after_path)

    before_h, before_w = before.shape[:2]
    after_h, after_w = after.shape[:2]

    aligned_before, aligned_after, dimensions_match = _resize_to_match(before, after)

    diff = cv2.absdiff(aligned_before, aligned_after)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray_diff, 24, 255, cv2.THRESH_BINARY)

    changed_pixels = int(np.count_nonzero(mask))
    total_pixels = int(mask.size)
    changed_pixels_percent = round((changed_pixels / total_pixels) * 100, 4)
    diff_score = round(changed_pixels / total_pixels, 4)
    layout_shift_score = _layout_shift_score(aligned_before, aligned_after)

    warnings: list[str] = []
    if not dimensions_match:
        warnings.append("Image dimensions differ; images were resized for comparison.")
    if layout_shift_score >= 0.45:
        warnings.append("Major layout shift detected between screenshots.")

    output_path: str | None = None
    if out is not None:
        output_file = Path(out)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        heatmap = cv2.applyColorMap(gray_diff, cv2.COLORMAP_JET)
        highlighted = aligned_after.copy()
        highlighted[mask > 0] = heatmap[mask > 0]
        cv2.imwrite(str(output_file), highlighted)
        output_path = str(output_file)

    return {
        "diffScore": diff_score,
        "changedPixelsPercent": changed_pixels_percent,
        "beforeSize": {"width": before_w, "height": before_h},
        "afterSize": {"width": after_w, "height": after_h},
        "dimensionsMatch": dimensions_match,
        "layoutShiftScore": layout_shift_score,
        "majorLayoutShift": layout_shift_score >= 0.45,
        "outputPath": output_path,
        "warnings": warnings,
    }