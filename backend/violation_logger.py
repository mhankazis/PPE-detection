"""
Violation State Machine — decides WHEN to log a PPE violation to the database.

Pipeline contract (per person, per frame):
    tracker_id   : int   — YOLOv11 tracking ID
    face_id      : str   — InsightFace identified name, or "Unknown"
    is_violating : bool  — True if missing required PPE
    timestamp    : float — current time in seconds (time.time())

State machine rules:
    1. Temporal Buffer      — violation must persist 5s continuously before logging.
    2. Known Face Cooldown  — known face_id gets 300s cooldown after first log.
    3. Unknown Tracker Lock — unknown face logs once per tracker_id, then locked forever.
    4. Clean Up             — purge expired cooldowns to bound memory.
"""

import time


class ViolationLogger:
    """Efficient in-memory state machine for violation deduplication."""

    # --- Tunable constants -------------------------------------------------
    BUFFER_DURATION = 5.0       # seconds a violation must persist before logging
    KNOWN_COOLDOWN = 300.0      # 5-minute cooldown for known face_id
    # -----------------------------------------------------------------------

    def __init__(self,
                 buffer_duration: float = BUFFER_DURATION,
                 known_cooldown: float = KNOWN_COOLDOWN):
        self.buffer_duration = buffer_duration
        self.known_cooldown = known_cooldown

        # tracker_id -> {"start": float, "face_id": str}
        # Tracks how long a violation has been continuously True per tracker.
        self._buffers: dict[int, dict] = {}

        # face_id -> expiry timestamp (when cooldown ends)
        # Only used for known faces (face_id != "Unknown").
        self._known_cooldowns: dict[str, float] = {}

        # Set of tracker_ids that have been logged as Unknown.
        # Permanent lock — never logged again while that tracker is alive.
        self._locked_trackers: set[int] = set()

    # ------------------------------------------------------------------ #
    # PUBLIC API                                                          #
    # ------------------------------------------------------------------ #

    def process(self, tracker_id: int, face_id: str, is_violating: bool,
                timestamp: float | None = None) -> bool:
        """
        Feed one observation for a person. Returns True if a DB log was emitted.

        Args:
            tracker_id: YOLOv11 tracking ID.
            face_id:    Identified name from InsightFace, or "Unknown".
            is_violating: True if the person is currently missing PPE.
            timestamp:  Optional override; defaults to time.time().

        Returns:
            True if the state machine decided to log this violation now.
        """
        if timestamp is None:
            timestamp = time.time()

        # --- Case A: person is NOT violating (or stopped violating) -------
        if not is_violating:
            # Reset the temporal buffer for this tracker — streak broken.
            self._buffers.pop(tracker_id, None)
            return False

        # --- Case B: person IS violating — advance the state machine ------

        # Pre-check locks/cooldowns BEFORE buffering to avoid needless work.
        # If already logged and still in cooldown/lock, skip silently.
        if self._is_suppressed(tracker_id, face_id, timestamp):
            # Still keep the buffer alive so a re-log isn't triggered the
            # instant a cooldown expires mid-violation.
            self._mark_buffer(tracker_id, face_id, timestamp)
            return False

        # Update / create the temporal buffer entry.
        entry = self._mark_buffer(tracker_id, face_id, timestamp)

        # Has the violation persisted long enough?
        if timestamp - entry["start"] < self.buffer_duration:
            return False  # not yet — keep waiting

        # Buffer satisfied → fire the log + register suppression.
        self._emit(tracker_id, face_id, timestamp)
        return True

    def cleanup(self, now: float | None = None) -> None:
        """
        Purge expired cooldowns and stale buffers to bound memory usage.

        Call periodically (e.g. once per minute) from the main loop.
        """
        if now is None:
            now = time.time()

        # Drop expired known-face cooldowns.
        expired_faces = [f for f, exp in self._known_cooldowns.items() if exp <= now]
        for f in expired_faces:
            del self._known_cooldowns[f]

        # NOTE: _locked_trackers is intentionally NOT cleared here.
        # Those trackers are locked for their entire lifetime. They should be
        # removed by the caller via forget_tracker() when the tracker disappears
        # from the scene (e.g. person leaves frame, tracker ID recycled).

    def forget_tracker(self, tracker_id: int) -> None:
        """
        Call when a tracker ID is no longer present in the scene.
        Clears all state for that tracker so its ID can be safely reused.
        """
        self._buffers.pop(tracker_id, None)
        self._locked_trackers.discard(tracker_id)
        # Known-face cooldowns are keyed by face_id, not tracker — left intact.

    # ------------------------------------------------------------------ #
    # INTERNAL HELPERS                                                    #
    # ------------------------------------------------------------------ #

    def _mark_buffer(self, tracker_id: int, face_id: str,
                     timestamp: float) -> dict:
        """Create or refresh the temporal buffer entry for a tracker."""
        entry = self._buffers.get(tracker_id)
        if entry is None:
            # First violation frame for this tracker — start the clock.
            entry = {"start": timestamp, "face_id": face_id}
            self._buffers[tracker_id] = entry
        else:
            # Update the latest known face_id (recognition can flip between
            # Unknown and known as InsightFace converges). We do NOT reset
            # the start time — the violation streak continues.
            entry["face_id"] = face_id
        return entry

    def _is_suppressed(self, tracker_id: int, face_id: str,
                       timestamp: float) -> bool:
        """True if this person is currently blocked from re-logging."""
        # Unknown path — permanent lock per tracker.
        if face_id == "Unknown":
            return tracker_id in self._locked_trackers

        # Known path — time-bounded cooldown.
        expiry = self._known_cooldowns.get(face_id)
        if expiry is None:
            return False
        if timestamp >= expiry:
            # Cooldown elapsed — clear it so a fresh violation can log again.
            del self._known_cooldowns[face_id]
            return False
        return True

    def _emit(self, tracker_id: int, face_id: str, timestamp: float) -> None:
        """Persist the violation and register the appropriate suppression."""
        # Hand off to the database layer.
        self._save_to_database(tracker_id=tracker_id,
                               face_id=face_id,
                               timestamp=timestamp)

        # Register suppression so we don't log the same person again.
        if face_id == "Unknown":
            # Unknown → permanent lock on this tracker.
            self._locked_trackers.add(tracker_id)
        else:
            # Known → 5-minute cooldown keyed by face_id.
            self._known_cooldowns[face_id] = timestamp + self.known_cooldown

        # Clear the buffer — violation has been logged; the next log cycle
        # (after cooldown) should require a fresh 5s streak.
        self._buffers.pop(tracker_id, None)

    # ------------------------------------------------------------------ #
    # DATABASE HOOK (implement me)                                        #
    # ------------------------------------------------------------------ #

    def _save_to_database(self, tracker_id: int, face_id: str,
                          timestamp: float) -> None:
        """
        Persist a single violation record.

        Replace this body with your SQL/NoSQL write. Suggested fields:
            - tracker_id : int   (NULL/None if face is known)
            - face_id    : str   (NULL/None if "Unknown")
            - timestamp  : float (or datetime.fromtimestamp(...))
            - severity, image_path, etc. — pass via instance attrs or closure.
        """
        # Example placeholder:
        # db.execute(
        #     "INSERT INTO violations (tracker_id, face_id, ts) VALUES (?, ?, ?)",
        #     (tracker_id if face_id == "Unknown" else None,
        #      face_id if face_id != "Unknown" else None,
        #      timestamp),
        # )
        pass
