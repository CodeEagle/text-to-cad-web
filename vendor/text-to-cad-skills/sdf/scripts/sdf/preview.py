from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET


INTERACTIVE_JOINT_TYPES = {"fixed", "continuous", "revolute", "prismatic"}


def viewer_sdf_path_for(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}.viewer.sdf")


def write_preview_sidecar_if_needed(xml_text: str, *, output_path: Path) -> Path | None:
    if output_path.name.lower().endswith(".viewer.sdf"):
        return None

    preview_path = viewer_sdf_path_for(output_path)
    if not needs_sdf_preview_repair(xml_text):
        try:
            preview_path.unlink()
        except FileNotFoundError:
            pass
        return None

    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview_text = rewrite_static_preview_sdf(xml_text)
    preview_path.write_text(preview_text if preview_text.endswith("\n") else preview_text + "\n", encoding="utf-8")
    return preview_path


def needs_sdf_preview_repair(xml_text: str) -> bool:
    root = ET.fromstring(xml_text)
    return _has_plugin(root) or any(_joint_needs_rewrite(element) for element in root.iter())


def rewrite_static_preview_sdf(xml_text: str) -> str:
    root = ET.fromstring(xml_text)
    _strip_plugins(root)
    for element in root.iter():
        if _joint_needs_rewrite(element):
            element.set("type", "fixed")
    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode", short_empty_elements=True)
    return f'<?xml version="1.0"?>\n{body}'


def _strip_plugins(parent: ET.Element) -> bool:
    changed = False
    for child in list(parent):
        if _local_name(child.tag) == "plugin":
            parent.remove(child)
            changed = True
        else:
            changed = _strip_plugins(child) or changed
    return changed


def _has_plugin(parent: ET.Element) -> bool:
    return any(_local_name(element.tag) == "plugin" for element in parent.iter())


def _joint_needs_rewrite(element: ET.Element) -> bool:
    if _local_name(element.tag) != "joint":
        return False
    joint_type = str(element.attrib.get("type") or "").strip().lower()
    return bool(joint_type) and joint_type not in INTERACTIVE_JOINT_TYPES


def _local_name(tag: object) -> str:
    value = str(tag)
    if "}" in value:
        return value.rsplit("}", 1)[1]
    return value
