from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np


def _load_image(path: str | Path) -> np.ndarray:
    image_path = Path(path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _dominant_colors(image: np.ndarray, count: int = 3) -> list[dict[str, Any]]:
    pixels = image.reshape(-1, 3).astype(np.float32)
    if pixels.size == 0:
        return []

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        pixels,
        min(count, len(pixels)),
        None,
        criteria,
        3,
        cv2.KMEANS_PP_CENTERS,
    )

    total = len(labels)
    buckets: dict[int, int] = {}
    for label in labels.flatten():
        buckets[int(label)] = buckets.get(int(label), 0) + 1

    colors: list[dict[str, Any]] = []
    for index, center in enumerate(centers):
        ratio = buckets.get(index, 0) / total
        b, g, r = [int(channel) for channel in center]
        colors.append(
            {
                "rgb": [r, g, b],
                "hex": f"#{r:02x}{g:02x}{b:02x}",
                "ratio": round(ratio, 4),
            }
        )

    colors.sort(key=lambda item: item["ratio"], reverse=True)
    return colors[:count]


def _blank_score(image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    std_dev = float(np.std(gray))
    # Low variance usually means a mostly empty or flat screenshot.
    score = 1.0 - min(std_dev / 40.0, 1.0)

    dominant = _dominant_colors(image, count=1)
    if dominant and dominant[0]["ratio"] > 0.92:
        score = max(score, dominant[0]["ratio"])

    return round(min(max(score, 0.0), 1.0), 4)


def _blur_score(image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Lower Laplacian variance means a blurrier image.
    if laplacian_var >= 500:
        score = 0.0
    elif laplacian_var <= 20:
        score = 1.0
    else:
        score = 1.0 - ((laplacian_var - 20) / 480)

    return round(min(max(score, 0.0), 1.0), 4)


def inspect_image(path: str | Path, *, include_colors: bool = True) -> dict[str, Any]:
    image = _load_image(path)
    height, width = image.shape[:2]

    blank_score = _blank_score(image)
    blur_score = _blur_score(image)

    warnings: list[str] = []
    if blank_score >= 0.85:
        warnings.append("Screenshot appears mostly blank or empty.")
    if blur_score >= 0.75:
        warnings.append("Screenshot appears blurry.")

    result: dict[str, Any] = {
        "width": width,
        "height": height,
        "blankScore": blank_score,
        "blurScore": blur_score,
        "isLikelyBlank": blank_score >= 0.85,
        "isLikelyBlurry": blur_score >= 0.75,
        "warnings": warnings,
    }

    if include_colors:
        result["dominantColors"] = _dominant_colors(image)

    return result