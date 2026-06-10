"""Optional screenshot visual inspection for Agent Browser."""

from .diff import diff_images
from .inspect import inspect_image

__all__ = ["inspect_image", "diff_images"]
__version__ = "0.1.0"