"""Apply the accepted changes to the original card before it is compared.

The UI tests compare every card with the original card, as deployed before
the move. A change made on purpose is listed here, as the text it replaces
in the original card, so the comparison shows only changes nobody asked
for. Each change must still apply, or this fails.

Usage: python accepted_changes.py <original card file>
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


def main() -> int:
    """Apply every change to the file, or fail if one no longer applies."""
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    for what, before, after in CHANGES:
        if text.count(before) != 1:
            sys.exit(f"Accepted change no longer applies: {what}")
        text = text.replace(before, after)
        print(f"Accepted change: {what}")
    path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
