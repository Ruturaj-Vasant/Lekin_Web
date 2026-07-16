#!/usr/bin/env python3
"""Run the pinned lekinpy v0.2.0 wheel against a ProblemDefinition payload
and dump raw Schedule.to_dict() output for all four built-in algorithms.

Provenance guarantees (per the real-execution-fixture task):
  - The wheel's actual SHA-256 is checked against the committed .sha256
    file before anything is imported. Mismatch aborts immediately.
  - lekinpy is imported ONLY from a fresh temp directory this script
    extracts the wheel into -- never from whatever "lekinpy" happens to
    already be resolvable on sys.path / globally pip-installed. This is
    the exact failure mode lekin-library_DECISIONS.md already documents
    once (a stale global install silently shadowing local source), and
    the reason this script refuses to just `import lekinpy`.
  - After import, lekinpy.__version__ AND the resolved module's __file__
    are both verified to point inside that extracted temp directory --
    not just a version-string match, which alone wouldn't catch a
    same-numbered lekinpy shadowing it from elsewhere on sys.path.

Usage:
  run_lekinpy_fixture.py --wheel <path> --sha256 <path> --problem <payload.json>

Prints one JSON object to stdout:
  {
    "lekinpyVersion": "0.2.0",
    "wheelSha256": "<actual digest>",
    "pythonVersion": "3.12.6",
    "algorithms": {
      "fcfs": {"schedule": {...to_dict()...}, "metadata": {...}},
      "spt":  {...}, "edd": {...}, "wspt": {...}
    }
  }
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import zipfile
from pathlib import Path


def fail(message: str) -> None:
    print(f"FIXTURE GENERATION FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def verify_checksum(wheel_path: Path, sha256_path: Path) -> str:
    if not wheel_path.is_file():
        fail(f"wheel not found at {wheel_path}")
    if not sha256_path.is_file():
        fail(f"checksum file not found at {sha256_path}")

    expected = sha256_path.read_text().strip()
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected.lower()):
        fail(
            f"checksum file {sha256_path} does not contain a bare 64-char "
            f"lowercase hex digest (ARCHITECTURE.md §2.3 format) -- got: {expected!r}"
        )

    actual = hashlib.sha256(wheel_path.read_bytes()).hexdigest()
    if actual.lower() != expected.lower():
        fail(
            f"wheel checksum mismatch for {wheel_path}\n"
            f"  expected (from {sha256_path}): {expected}\n"
            f"  actual (computed just now):    {actual}\n"
            f"The pinned wheel may have been corrupted or silently replaced."
        )
    return actual


def import_lekinpy_from_wheel(wheel_path: Path, expected_version: str):
    extract_dir = Path(tempfile.mkdtemp(prefix="lekinpy-fixture-"))
    with zipfile.ZipFile(wheel_path) as zf:
        zf.extractall(extract_dir)

    # Insert at position 0 so this extracted copy wins over anything already
    # on sys.path, and make sure lekinpy hasn't already been imported by
    # something else in this same process (it shouldn't have been -- this
    # script only ever imports it here -- but assert it rather than assume).
    if "lekinpy" in sys.modules:
        fail("lekinpy was already imported before the pinned wheel could be loaded")
    sys.path.insert(0, str(extract_dir))

    import lekinpy  # noqa: E402  (must be imported after sys.path mutation)

    resolved_file = Path(lekinpy.__file__).resolve()
    if extract_dir.resolve() not in resolved_file.parents:
        fail(
            f"imported lekinpy from {resolved_file}, which is NOT inside the "
            f"wheel-extracted directory {extract_dir} -- something on sys.path "
            f"shadowed the pinned wheel. Refusing to use a lekinpy install "
            f"whose provenance isn't the pinned wheel."
        )
    if lekinpy.__version__ != expected_version:
        fail(
            f"lekinpy.__version__ == {lekinpy.__version__!r}, expected "
            f"{expected_version!r}. The pinned wheel's contents don't match "
            f"what this script was told to expect."
        )
    return lekinpy


def build_system(lekinpy_module, payload: dict):
    System = lekinpy_module.System
    Job = lekinpy_module.Job
    Operation = lekinpy_module.Operation
    Machine = lekinpy_module.Machine
    Workcenter = lekinpy_module.Workcenter

    system = System()
    for wc in payload["workcenters"]:
        machines = [
            Machine(name=m["name"], release=m["release"], status=m["status"])
            for m in wc["machines"]
        ]
        system.add_workcenter(
            Workcenter(name=wc["name"], release=wc["release"], status=wc["status"], machines=machines)
        )
    for job in payload["jobs"]:
        operations = [
            Operation(workcenter=op["workcenter"], processing_time=op["processing_time"], status=op["status"])
            for op in job["operations"]
        ]
        rgb = tuple(job["rgb"]) if job.get("rgb") is not None else None
        system.add_job(
            Job(
                job_id=job["job_id"],
                release=job["release"],
                due=job["due"],
                weight=job["weight"],
                operations=operations,
                rgb=rgb,
            )
        )
    return system


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wheel", required=True, type=Path)
    parser.add_argument("--sha256", required=True, type=Path)
    parser.add_argument("--problem", required=True, type=Path, help="ProblemDefinition-derived System payload JSON")
    parser.add_argument("--expected-version", default="0.2.0")
    args = parser.parse_args()

    actual_checksum = verify_checksum(args.wheel, args.sha256)
    lekinpy = import_lekinpy_from_wheel(args.wheel, args.expected_version)

    payload = json.loads(args.problem.read_text())

    algorithm_classes = {
        "fcfs": lekinpy.FCFSAlgorithm,
        "spt": lekinpy.SPTAlgorithm,
        "edd": lekinpy.EDDAlgorithm,
        "wspt": lekinpy.WSPTAlgorithm,
    }

    results = {}
    for algorithm_id, algorithm_class in algorithm_classes.items():
        # Fresh System per algorithm: _assign_single_operation mutates
        # Operation/Job objects in place, so reusing one System across
        # multiple algorithm runs would corrupt later results with earlier
        # runs' start/end times.
        system = build_system(lekinpy, payload)
        instance = algorithm_class()
        schedule = instance.schedule(system)
        results[algorithm_id] = {
            "schedule": schedule.to_dict(),
            "metadata": dict(instance.metadata),
        }

    output = {
        "lekinpyVersion": lekinpy.__version__,
        "wheelSha256": actual_checksum,
        "pythonVersion": sys.version.split()[0],
        "algorithms": results,
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
