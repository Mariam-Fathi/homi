"""Writes the event registry to shared/tracking-plan.json.

    python -m app.events

Run after changing app/events/registry.py; a backend test fails if the committed
file is out of date, and a mobile test fails if the app's events don't match it.
"""

import json
from pathlib import Path

from app.events.registry import export_plan

OUTPUT = Path(__file__).resolve().parents[3] / "shared" / "tracking-plan.json"


def render() -> str:
    return json.dumps(export_plan(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(render(), encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT}")
