"""Bounded warning episodes with independent, explicitly manual review labels."""

from __future__ import annotations

import statistics
import uuid


class ParkingEvidence:
    def __init__(self):
        self.segment_id = str(uuid.uuid4())
        self.episodes: list[dict] = []
        self.next_id = 1
        self.open: dict[int, dict] = {}

    def update(self, shadow: dict, now: float, detections: list[dict]):
        for cue_id, event in list(self.open.items()):
            if now - event["last_seen_s"] > 0.8:
                del self.open[cue_id]
        for cue in shadow.get("cues", []):
            event = self.open.get(cue["id"])
            if event is None:
                event = {"id": self.next_id, "warning_s": now, "last_seen_s": now,
                         "cue_observed_since_s": cue["observed_since_s"], "side": cue["side"],
                         "visible_road_users_at_warning": len(detections), "review": "unreviewed",
                         "first_visible_s": None, "lead_s": None}
                self.next_id += 1
                self.episodes.append(event)
                self.open[cue["id"]] = event
            event["last_seen_s"] = now
        # Keep bounded local-session memory. IDs are never reused.
        self.episodes = self.episodes[-100:]
        retained = {item["id"] for item in self.episodes}
        self.open = {key: item for key, item in self.open.items() if item["id"] in retained}

    def review(self, event_id: int, outcome: str, visible_s: float | None, now: float, segment_id: str):
        if segment_id != self.segment_id:
            raise ValueError("Playback was restarted or skipped. This warning belongs to a previous segment.")
        event = next((item for item in self.episodes if item["id"] == event_id), None)
        if event is None:
            raise KeyError("Warning episode not found in this session")
        if outcome not in {"first_visible", "unrelated", "unreviewed"}:
            raise ValueError("Choose first_visible, unrelated or unreviewed")
        if outcome == "first_visible":
            if visible_s is None or not event["warning_s"] - 30 <= visible_s <= min(now + 2.5, event["last_seen_s"] + 30):
                raise ValueError("Visibility timestamp must be within the recorded encounter (30 seconds around the cue)")
            event["first_visible_s"] = visible_s
            event["lead_s"] = round(visible_s - event["warning_s"], 3)
        else:
            event["first_visible_s"], event["lead_s"] = None, None
        event["review"] = outcome
        return self.snapshot()

    def snapshot(self):
        labelled = [event for event in self.episodes if event["review"] == "first_visible"]
        leads = [event["lead_s"] for event in labelled]
        return {"segment_id": self.segment_id, "episodes": [dict(item) for item in self.episodes],
                "summary": {"retained_episodes": len(self.episodes), "reviewed_approaches": len(labelled),
                            "unrelated_cues": sum(item["review"] == "unrelated" for item in self.episodes),
                            "unreviewed": sum(item["review"] == "unreviewed" for item in self.episodes),
                            "early_warnings": sum(value > 0 for value in leads),
                            "median_lead_s": round(statistics.median(leads), 3) if leads else None},
                "basis": "manual visibility labels; frame-time lead excludes inference/transport/display latency; missed approaches are not counted"}
