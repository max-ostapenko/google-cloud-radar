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
    if (not new_flat and old_flat) or (len(new_flat) < 5 and len(removed) > 40 and not added):
        logger.info(
            f"  {filename}: document wiped or deleted ({len(removed)} removals, {len(new_flat)} remaining). "
            "Skipping feed generation to prevent transient sweep false positives."
        )
        return None

    if not added and not removed and not modified:
        logger.info(f"  {filename}: only noise changes, skipping")
        return None

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
