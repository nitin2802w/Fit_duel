# Rep Validity Rules

*Authoritative spec for what constitutes a valid push-up rep in FitDuel. This document is the source of truth — both the AI Engine and the Anti-Cheat module are implemented against it.*

---

## 1. Camera Setup Requirement

- The user must be filmed **from the side** (profile view).
- Pose detection relies on joint angle measurements, which are only meaningful from a side perspective.

---

## 2. Calibration (Alignment Phase)

Before counting begins, the user must hold a valid **starting position** for **≥ 1.5 seconds**:

| Criterion | Value |
|-----------|-------|
| Elbow angle (arms straight) | ≥ 150° |
| Back angle (hip–shoulder–ankle straight) | ≥ 155° |
| Body orientation | Horizontal (plank) — see §4 |
| Landmark visibility | ≥ 0.5 confidence |

Calibration derives personalized thresholds:

```
down_thresh       = clamp(calibrated_elbow - 65,  70, 110)
up_thresh         = clamp(calibrated_elbow - 15, 140, 175)
up_thresh         = max(up_thresh, down_thresh + 20)   # hysteresis gap
back_straight_min = clamp(calibrated_back  - 12, 140, 170)
```

---

## 3. Rep State Machine

A rep is counted when the state transitions: **UP → DOWN → UP**

| State transition | Trigger condition |
|-----------------|-------------------|
| UP → DOWN | Elbow angle drops **below** `down_thresh` |
| DOWN → UP | Elbow angle rises **above** `up_thresh` |

---

## 4. Plank Orientation Guard

Counting is paused unless the body is in plank orientation:

- `tilt(shoulder → hip)` ≤ 40° from horizontal
- `tilt(hip → ankle)` ≤ 40° from horizontal

This prevents fake reps from kneeling/standing with bent arms.

---

## 5. Rep Validity Criteria

A rep increments the count **only if ALL** of the following hold:

| Criterion | Requirement |
|-----------|-------------|
| **Depth** | `min_elbow_in_rep < down_thresh` (full range of motion reached) |
| **Back straightness** | Back angle stayed ≥ `back_straight_min` for the entire rep |
| **Plank orientation** | Body was horizontal throughout (§4) |

### Feedback messages

| Situation | Message |
|-----------|---------|
| Valid rep | `"Good rep!"` |
| Insufficient depth | `"Go lower - not full range of motion"` |
| Back broke | `"Keep your back/hips in a straight line"` |

---

## 6. Loss-of-Tracking

- If the person is lost for **> 1.5 seconds**, the system reverts to the calibration (ALIGN) phase.
- Rep count is preserved across re-calibrations.

---

## 7. Event Contract (AI Engine Output)

Every time a rep attempt completes, the AI Engine emits a structured event:

```typescript
interface RepEvent {
  repCompleted: boolean;   // did a full down-up cycle occur?
  valid: boolean;          // did it pass all validity checks?
  confidence: number;      // landmark visibility score (0–1)
  elbowAngle: number;      // smoothed elbow angle at bottom of rep (degrees)
  backAngle: number;       // smoothed back angle (degrees)
  timestamp: number;       // ms since session start
}
```

The server **never receives video** — only these small events.

---

## 8. Anti-Cheat Plausibility Bounds (server-side)

| Check | Limit |
|-------|-------|
| Max reps per second | 1.5 |
| Min time between valid reps | 667 ms |
| Max reps in any 10-second window | 12 |
| Confidence threshold | ≥ 0.5 required |
