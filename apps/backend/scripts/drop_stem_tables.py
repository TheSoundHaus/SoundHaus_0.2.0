"""
drop_stem_tables.py — one-off migration to remove all stem-splitting database
artifacts after the feature has been removed from the codebase.

Drops, in order:
  - stem_files          (rows per stem file produced by a job)
  - snippet_versions    (one row per stem-separation job run)
  - stemtype            (PostgreSQL enum)
  - stemjobstatus       (PostgreSQL enum)

Usage:
    cd apps/backend
    python scripts/drop_stem_tables.py [--yes]

The script reads DATABASE_URL from settings (config.py) which loads the
appropriate .env file based on the active compose profile. Run against the
production / staging DB only after backing up.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow execution as `python scripts/drop_stem_tables.py` from apps/backend/
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import text  # noqa: E402

from database import engine  # noqa: E402


_STATEMENTS: list[str] = [
    "DROP TABLE IF EXISTS stem_files CASCADE;",
    "DROP TABLE IF EXISTS snippet_versions CASCADE;",
    "DROP TYPE IF EXISTS stemtype;",
    "DROP TYPE IF EXISTS stemjobstatus;",
]


def main() -> int:
    auto_confirm = "--yes" in sys.argv or "-y" in sys.argv
    print("This will permanently drop the following objects from:")
    print(f"  {engine.url}")
    for stmt in _STATEMENTS:
        print(f"  {stmt}")

    if not auto_confirm:
        try:
            answer = input("\nType 'DROP STEMS' to proceed: ").strip()
        except EOFError:
            print("Aborted (no TTY). Re-run with --yes to skip the prompt.")
            return 1
        if answer != "DROP STEMS":
            print("Aborted.")
            return 1

    with engine.begin() as conn:
        for stmt in _STATEMENTS:
            print(f"-> {stmt}")
            conn.execute(text(stmt))

    print("Stem tables and enums dropped successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
