"""Apply the accepted changes to the original card before it is compared.

The UI tests compare every card with the original card, as deployed before
the move. A change made on purpose is listed here, as the text it replaces
in the original card, so the comparison shows only changes nobody asked
for. Each change must still apply, or this fails.

Changes listed in FIXES are bugs the rewrite fixes. They apply only when
the rewrite is compared (--fixes); the card before the rewrite still has them.

Usage: python accepted_changes.py <original card file> [--fixes]
"""

from __future__ import annotations

import sys
from pathlib import Path

CHANGES = [
    (
        "The standby mode ON is written On (upstream names it ON)",
        'const standbyLabel = (mode) => (/^auto on$/i.test(mode ?? "") ? "Auto" : mode);',
        'const standbyLabel = (mode) => (/^auto on$/i.test(mode ?? "") ? "Auto" : /^on$/i.test(mode ?? "") ? "On" : mode);',
    ),
    (
        "The Bluetooth badge sits bottom right, the standby badge bottom left",
        "    this._badge.style.top = `${cy - r * .7071}px`;\n"
        "    this._standbyBadge.style.left = `${cx + r * .7071}px`;",
        "    this._badge.style.top = `${cy + r * .7071}px`;\n"
        "    this._standbyBadge.style.left = `${cx - r * .7071}px`;",
    ),
]

FIXES = [
    (
        "The driver ring has its color from the first render (K-13: it was gray until the next state change)",
        "  connectedCallback() {\n    this._layout();\n  }",
        "  connectedCallback() {\n    if (this._tile && this._hass) this._tile.hass = this._innerHass(this._hass);\n    this._layout();\n  }",
    ),
]


def main() -> int:
    """Apply every change to the file, or fail if one no longer applies."""
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    changes = CHANGES + (FIXES if "--fixes" in sys.argv[2:] else [])
    for what, before, after in changes:
        if text.count(before) != 1:
            sys.exit(f"Accepted change no longer applies: {what}")
        text = text.replace(before, after)
        print(f"Accepted change: {what}")
    path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
