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


def test_delete_scene_removes_dependent_records(tmp_path: Path) -> None:
    store = Store(tmp_path / "umbra.sqlite3")
    scene = store.create_scene({"name": "Delete me"})
    calibration = store.create_media({"scene_id": scene["id"], "role": "calibration", "original_name": "cal.mp4", "path": "/tmp/cal.mp4"})
    main = store.create_media({"scene_id": scene["id"], "role": "main", "original_name": "main.mp4", "path": "/tmp/main.mp4"})
    trial = store.create_trial(scene["id"], {"name": "Trial", "calibration_media_id": calibration["id"], "main_media_id": main["id"]})
    analysis = store.create_analysis(trial["id"], "/tmp/run/result.json")

    deleted = store.delete_scene(scene["id"])

    assert deleted is not None
    assert deleted["media_paths"] == ["/tmp/cal.mp4", "/tmp/main.mp4"]
    assert deleted["analyses"] == [{"id": analysis["id"], "path": "/tmp/run/result.json"}]
    assert store.get_scene(scene["id"]) is None
    assert store.get_media(calibration["id"]) is None
    assert store.get_trial(trial["id"]) is None
    assert store.get_analysis(analysis["id"]) is None
