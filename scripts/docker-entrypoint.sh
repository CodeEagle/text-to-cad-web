#!/bin/sh
set -eu

DATA_ROOT="${TEXT_TO_CAD_DATA_DIR:-/data}"
CODEX_HOME_DIR="${CODEX_HOME:-$DATA_ROOT/codex-home}"
TARGET_SKILLS_DIR="$CODEX_HOME_DIR/skills"
BUNDLED_SKILLS_DIR="/opt/text-to-cad-skills"

mkdir -p "$TARGET_SKILLS_DIR"

if [ -d "$BUNDLED_SKILLS_DIR" ]; then
  for skill_dir in "$BUNDLED_SKILLS_DIR"/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    if [ ! -f "$TARGET_SKILLS_DIR/$skill_name/SKILL.md" ]; then
      rm -rf "$TARGET_SKILLS_DIR/$skill_name"
      cp -R "$skill_dir" "$TARGET_SKILLS_DIR/$skill_name"
    fi
  done
fi

exec "$@"
