"""
Pre-processes a git diff of discovery JSON documents into a clean, structured
representation per API — stripping noise and surfacing semantically meaningful
additions, removals, and modifications.

The output feeds directly into the LLM prompt.
"""

import json
import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

# Keys that change on every sync and carry no semantic value for developers
NOISE_KEYS = frozenset(
    [
        "revision",
        "etag",
        "rootUrl",
        "servicePath",
        "batchPath",
        "baseUrl",
        "basePath",
        "documentationLink",
        "ownerDomain",
        "ownerName",
        "packagePath",
        "id",  # top-level only — filtered by path depth check
    ]
)

# Top-level path segments that are structural/infrastructure, not developer API surface
# e.g. endpoints[] changes are just regional URL shuffles
NOISE_PATH_PREFIXES = frozenset(["endpoints"])

# Keys that are only descriptive, not structural
DESCRIPTION_ONLY_KEYS = frozenset(["description", "title"])

# Maximum number of change entries per category to send to the LLM
MAX_ENTRIES_PER_CATEGORY = 60


def get_changed_discovery_files(base_ref: str, head_ref: str) -> list[str]:
    """Return list of discovery JSON filenames that changed between two refs."""
    result = subprocess.run(
        ["git", "diff", "--name-only", base_ref, head_ref, "--", "discoveries/"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        logger.warning(f"git diff --name-only failed: {result.stderr}")
        return []
    paths = [
        p.strip() for p in result.stdout.splitlines() if p.strip().endswith(".json")
    ]
    return paths  # e.g. ['discoveries/bigquery.v2.json', ...]


def get_file_content_at_ref(ref: str, filepath: str) -> str:
    """Return full file content at a specific git ref, or '' if it didn't exist."""
    result = subprocess.run(
        ["git", "show", f"{ref}:{filepath}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return ""  # file didn't exist at this ref (new or deleted)
    return result.stdout


def _flatten_json(obj, prefix: str = "") -> dict[str, object]:
    """Recursively flatten a JSON object into dot-notation paths."""
    items: dict[str, object] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                items.update(_flatten_json(v, new_key))
            else:
                items[new_key] = v
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            new_key = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)):
                items.update(_flatten_json(v, new_key))
            else:
                items[new_key] = v
    return items


def _is_noise_path(path: str) -> bool:
    """Return True if a change at this path is pure noise (no developer impact)."""
    parts = path.split(".")
    # Top-level noise keys (e.g. revision, etag)
    if parts[0] in NOISE_KEYS:
        return True
    # Top-level structural prefixes (e.g. endpoints[N].location — infra noise)
    top_segment = parts[0].split("[")[0]
    if top_segment in NOISE_PATH_PREFIXES:
        return True
    # The key at the leaf level is a noise key
    leaf = parts[-1].split("[")[0]  # strip array index
    if leaf in NOISE_KEYS:
        return True
    return False


def _is_description_only(path: str) -> bool:
    leaf = path.split(".")[-1].split("[")[0]
    return leaf in DESCRIPTION_ONLY_KEYS


def detect_breaking_changes(
    old_flat: dict[str, object],
    new_flat: dict[str, object],
    added_paths: list[str],
    removed_paths: list[str],
    modified_paths: list[str],
) -> tuple[bool, list[str]]:
    """Deterministically evaluates whether changes constitute backward-incompatible API changes.

    Follows Google AIP-180 rules:
    - Removal of an active method / RPC
    - Removal of a parameter from an active method
    - Changing an optional parameter to required (required: true)
    - Removal of an existing schema property
    - Changing property data type (type or $ref)
    - Making a mutable schema property read-only / immutable
    - Changing HTTP verb or URI path template of an existing method

    Returns:
        (is_breaking: bool, reasons: list[str])
    """
    reasons: list[str] = []

    # 1. Inspect Added Paths (New required parameters or readOnly constraints on existing resources)
    for p in added_paths:
        parts = p.split(".")
        new_val = new_flat.get(p)
        if (
            parts[-1] == "required"
            and "parameters" in parts
            and new_val in (True, "true")
        ):
            param_name = parts[-2] if len(parts) >= 2 else "parameter"
            reason = f"Parameter '{param_name}' was changed to strictly required"
            if reason not in reasons:
                reasons.append(reason)
        elif (
            parts[-1] == "readOnly"
            and "schemas" in parts
            and "properties" in parts
            and new_val in (True, "true")
        ):
            s_idx = parts.index("schemas")
            p_idx = parts.index("properties")
            schema_name = parts[s_idx + 1] if len(parts) > s_idx + 1 else "Schema"
            prop_name = parts[p_idx + 1] if len(parts) > p_idx + 1 else "property"
            reason = f"Property '{prop_name}' in schema '{schema_name}' was made read-only / immutable"
            if reason not in reasons:
                reasons.append(reason)

    # 2. Inspect Removed Paths
    for p in removed_paths:
        parts = p.split(".")

        # Removed API method
        if "methods" in parts:
            idx = parts.index("methods")
            if len(parts) > idx + 1:
                method_name = parts[idx + 1]
                if len(parts) == idx + 2 or (
                    len(parts) == idx + 3
                    and parts[idx + 2] in ("httpMethod", "id", "path")
                ):
                    reason = f"Removed API method '{method_name}'"
                    if reason not in reasons:
                        reasons.append(reason)

        # Removed parameter from method
        if "parameters" in parts and "methods" in parts:
            idx = parts.index("parameters")
            if len(parts) > idx + 1:
                param_name = parts[idx + 1]
                if len(parts) == idx + 2 or (
                    len(parts) == idx + 3
                    and parts[idx + 2] in ("type", "location", "format")
                ):
                    reason = f"Removed parameter '{param_name}' from method"
                    if reason not in reasons:
                        reasons.append(reason)

        # Removed schema property
        if "schemas" in parts and "properties" in parts:
            s_idx = parts.index("schemas")
            p_idx = parts.index("properties")
            if s_idx < p_idx and len(parts) > p_idx + 1:
                schema_name = parts[s_idx + 1]
                prop_name = parts[p_idx + 1]
                if len(parts) == p_idx + 2 or (
                    len(parts) == p_idx + 3
                    and parts[p_idx + 2] in ("type", "$ref", "format")
                ):
                    reason = (
                        f"Removed property '{prop_name}' from schema '{schema_name}'"
                    )
                    if reason not in reasons:
                        reasons.append(reason)

    # 3. Inspect Modified Paths
    for p in modified_paths:
        parts = p.split(".")
        old_val = old_flat.get(p)
        new_val = new_flat.get(p)

        # Parameter made required
        if parts[-1] == "required" and "parameters" in parts:
            if old_val in (False, None, "false") and new_val in (True, "true"):
                param_name = parts[-2] if len(parts) >= 2 else "parameter"
                reason = f"Parameter '{param_name}' was changed to strictly required"
                if reason not in reasons:
                    reasons.append(reason)

        # Schema property type, $ref, or readOnly changes
        if "schemas" in parts and "properties" in parts:
            s_idx = parts.index("schemas")
            p_idx = parts.index("properties")
            if s_idx < p_idx and len(parts) > p_idx + 2:
                schema_name = parts[s_idx + 1]
                prop_name = parts[p_idx + 1]
                attr = parts[p_idx + 2]

                if attr == "type" and old_val != new_val:
                    reason = f"Property '{prop_name}' in schema '{schema_name}' changed type from '{old_val}' to '{new_val}'"
                    if reason not in reasons:
                        reasons.append(reason)
                elif attr == "$ref" and old_val != new_val:
                    reason = f"Property '{prop_name}' in schema '{schema_name}' changed referenced type from '{old_val}' to '{new_val}'"
                    if reason not in reasons:
                        reasons.append(reason)
                elif (
                    attr == "readOnly"
                    and (old_val in (False, None))
                    and (new_val is True)
                ):
                    reason = f"Property '{prop_name}' in schema '{schema_name}' was made read-only / immutable"
                    if reason not in reasons:
                        reasons.append(reason)

        # Method HTTP verb or URI path template change
        if "methods" in parts:
            m_idx = parts.index("methods")
            if len(parts) > m_idx + 2:
                method_name = parts[m_idx + 1]
                attr = parts[m_idx + 2]
                if attr == "httpMethod" and old_val != new_val:
                    reason = f"Method '{method_name}' changed HTTP verb from '{old_val}' to '{new_val}'"
                    if reason not in reasons:
                        reasons.append(reason)
                elif attr == "path" and old_val != new_val:
                    reason = f"Method '{method_name}' URI path template changed from '{old_val}' to '{new_val}'"
                    if reason not in reasons:
                        reasons.append(reason)

    is_breaking = len(reasons) > 0
    return is_breaking, reasons


def build_structured_diff(
    filename: str, old_json_str: str, new_json_str: str
) -> Optional[dict]:
    """Produce a structured diff dict for a single API file.

    Returns None if the diff is purely noise (nothing developer-relevant changed).
    """
    try:
        old = json.loads(old_json_str) if old_json_str.strip() else {}
        new = json.loads(new_json_str) if new_json_str.strip() else {}
    except json.JSONDecodeError as e:
        logger.warning(f"Could not parse JSON for {filename}: {e}")
        return None

    old_flat = _flatten_json(old)
    new_flat = _flatten_json(new)

    old_keys = set(old_flat.keys())
    new_keys = set(new_flat.keys())

    added_paths = new_keys - old_keys
    removed_paths = old_keys - new_keys
    common_paths = old_keys & new_keys
    modified_paths = {p for p in common_paths if old_flat[p] != new_flat[p]}

    def _filter(paths):
        return [p for p in paths if not _is_noise_path(p)]

    added = _filter(added_paths)
    removed = _filter(removed_paths)
    modified = _filter(modified_paths)

    # Safeguard against document sweeps / transient whole-file deletions:
    # If the file was deleted (new is empty) or virtually all content was stripped without additions,
    # skip generating an update. True GCP API deprecations occur inside active discovery docs
    # with explicit "deprecated: true" flags.
    if (not new_flat and old_flat) or (
        len(new_flat) < 5 and len(removed) > 40 and not added
    ):
        logger.info(
            f"  {filename}: document wiped or deleted ({len(removed)} removals, {len(new_flat)} remaining). "
            "Skipping feed generation to prevent transient sweep false positives."
        )
        return None

    if not added and not removed and not modified:
        logger.info(f"  {filename}: only noise changes, skipping")
        return None

    # Compute deterministic breaking change analysis
    is_breaking, breaking_reasons = detect_breaking_changes(
        old_flat, new_flat, added, removed, modified
    )

    # Build structured entries (cap size to stay within token budget)
    def _added_entries(paths):
        out = []
        for p in sorted(paths)[:MAX_ENTRIES_PER_CATEGORY]:
            entry = {"path": p}
            val = new_flat[p]
            if not isinstance(val, (dict, list)):
                entry["value"] = val
            out.append(entry)
        return out

    def _removed_entries(paths):
        out = []
        for p in sorted(paths)[:MAX_ENTRIES_PER_CATEGORY]:
            entry = {"path": p}
            val = old_flat[p]
            if not isinstance(val, (dict, list)):
                entry["old_value"] = val
            out.append(entry)
        return out

    def _modified_entries(paths):
        out = []
        for p in sorted(paths)[:MAX_ENTRIES_PER_CATEGORY]:
            out.append({"path": p, "old": old_flat[p], "new": new_flat[p]})
        return out

    api_name = filename.replace(".json", "")  # e.g. bigquery.v2
    return {
        "api": api_name,
        "is_breaking": is_breaking,
        "breaking_reasons": breaking_reasons,
        "added": _added_entries(added),
        "removed": _removed_entries(removed),
        "modified": _modified_entries(modified),
        # Counts useful for prompt context
        "_stats": {
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
            "description_only_modified": sum(
                1 for p in modified if _is_description_only(p)
            ),
            "is_breaking": is_breaking,
            "breaking_reasons": breaking_reasons,
        },
    }


def extract_structured_diffs(
    base_ref: str = "HEAD~1", head_ref: str = "HEAD"
) -> list[dict]:
    """Main entry point: returns a list of structured diffs, one per changed API.

    Args:
        base_ref: Git ref for the base (old) state.
        head_ref: Git ref for the head (new) state.

    Returns:
        List of structured diff dicts, one per API, filtered of noise-only changes.
    """
    logger.info(
        f"Detecting changed discovery files between {base_ref} and {head_ref} ..."
    )
    changed_paths = get_changed_discovery_files(base_ref, head_ref)

    if not changed_paths:
        logger.info("No discovery files changed — nothing to analyse")
        return []

    # Filter out the index file — it's not per-API content
    changed_paths = [p for p in changed_paths if not p.endswith("index.json")]
    logger.info(f"Found {len(changed_paths)} changed API discovery files")

    results = []
    for filepath in sorted(changed_paths):
        filename = filepath.split("/")[-1]  # e.g. bigquery.v2.json
        logger.info(f"Processing {filename} ...")
        old_content = get_file_content_at_ref(base_ref, filepath)
        new_content = get_file_content_at_ref(head_ref, filepath)
        diff = build_structured_diff(filename, old_content, new_content)
        if diff is not None:
            results.append(diff)

    logger.info(f"Produced {len(results)} non-trivial structured diffs")
    return results
