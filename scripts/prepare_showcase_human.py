"""Prepare the CC0 Quaternius human for the corner showcase.

Retain the mesh, skeleton and in-place walk; remove unused animations/textures
and compact their buffers. See frontend/public/models/README.md for provenance.
"""

from __future__ import annotations

import copy
import json
import struct
import sys
from pathlib import Path


def prepare(source: Path, destination: Path) -> None:
    raw = source.read_bytes()
    magic, version, _ = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("Expected a glTF 2.0 binary")
    json_size = struct.unpack_from("<I", raw, 12)[0]
    data = json.loads(raw[20:20 + json_size])
    binary_start = 20 + json_size + 8
    binary = raw[binary_start:]
    walk = next(animation for animation in data["animations"] if animation["name"].endswith("|Walk"))
    data["animations"] = [walk]
    walk["name"] = "Walk"
    # A neutral clay material preserves the monochrome architectural scene.
    data["materials"] = [{"name": "Umbra human", "pbrMetallicRoughness": {
        "baseColorFactor": [0.72, 0.74, 0.70, 1], "metallicFactor": 0.04, "roughnessFactor": 0.75,
    }}]
    for key in ("images", "textures", "samplers"):
        data.pop(key, None)

    references: list[tuple[dict, str]] = []
    for mesh in data["meshes"]:
        for primitive in mesh["primitives"]:
            primitive["material"] = 0
            references.extend((primitive["attributes"], key) for key in primitive["attributes"])
            if "indices" in primitive:
                references.append((primitive, "indices"))
            for target in primitive.get("targets", []):
                references.extend((target, key) for key in target)
    references.extend((skin, "inverseBindMatrices") for skin in data["skins"] if "inverseBindMatrices" in skin)
    for sampler in walk["samplers"]:
        references.extend([(sampler, "input"), (sampler, "output")])

    used_accessors = sorted({owner[key] for owner, key in references})
    accessor_map = {old: new for new, old in enumerate(used_accessors)}
    accessors = [copy.deepcopy(data["accessors"][index]) for index in used_accessors]
    for owner, key in references:
        owner[key] = accessor_map[owner[key]]
    view_refs = [(accessor, "bufferView") for accessor in accessors if "bufferView" in accessor]
    for accessor in accessors:
        if "sparse" in accessor:
            view_refs.extend([(accessor["sparse"]["indices"], "bufferView"),
                              (accessor["sparse"]["values"], "bufferView")])
    used_views = sorted({owner[key] for owner, key in view_refs})
    view_map = {old: new for new, old in enumerate(used_views)}
    packed = bytearray()
    views = []
    for index in used_views:
        view = copy.deepcopy(data["bufferViews"][index])
        packed.extend(b"\0" * (-len(packed) % 4))
        start = view.get("byteOffset", 0)
        view["byteOffset"] = len(packed)
        view["buffer"] = 0
        packed.extend(binary[start:start + view["byteLength"]])
        views.append(view)
    for owner, key in view_refs:
        owner[key] = view_map[owner[key]]
    data["accessors"] = accessors
    data["bufferViews"] = views
    data["buffers"] = [{"byteLength": len(packed)}]
    data["asset"]["generator"] = "Umbra showcase asset preparation (CC0 Quaternius source)"
    encoded = json.dumps(data, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    packed.extend(b"\0" * (-len(packed) % 4))
    output = (struct.pack("<III", magic, 2, 12 + 8 + len(encoded) + 8 + len(packed))
              + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
              + struct.pack("<II", len(packed), 0x004E4942) + packed)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    print(f"Prepared {destination.name}: {len(raw):,} → {len(output):,} bytes")


if __name__ == "__main__":
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
