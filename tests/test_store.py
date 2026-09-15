from pathlib import Path

from umbra.store import Store


def test_store_round_trip(tmp_path: Path) -> None:
    store = Store(tmp_path / "umbra.sqlite3")
    scene = store.create_scene({"name": "Corner A", "notes": "controlled"})
    media = store.create_media(
        {
            "scene_id": scene["id"],
            "role": "calibration",
            "original_name": "empty.mp4",
            "path": "/tmp/empty.mp4",
            "metadata": {"fps": 10},
        }
    )
    assert store.get_scene(scene["id"])["name"] == "Corner A"
    assert store.get_media(media["id"])["metadata"] == {"fps": 10}
