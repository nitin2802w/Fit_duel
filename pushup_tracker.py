"""
Push-up Tracker
================
Uses your webcam + MediaPipe's Pose Landmarker to count push-up reps and
flag common form issues in real time.

Before it starts counting, it walks you through a short ALIGNMENT step:
you get into the push-up starting position (arms straight, body straight,
side-on to the camera) and hold still for ~1.5 seconds. The app uses that
hold to learn what "arms straight" and "back straight" actually look like
for your body/camera angle, then only starts counting once you've locked
in. If you step out of frame or lose position for a while, it drops back
to the alignment screen instead of silently miscounting.

Counting also only runs while your body is actually lying in a horizontal
plank line (checked via shoulder-hip-ankle tilt), so kneeling, sitting, or
standing up between sets and moving your arm around won't rack up fake
reps - joint angles alone can't tell those apart from a real push-up.

CAMERA SETUP: stand so the camera sees you from the SIDE (a profile view),
not straight-on. The form checks work by measuring joint angles, which
only make sense from a side view.

Install:
    pip install mediapipe opencv-python numpy

Run:
    python pushup_tracker.py
    (press 'q' in the video window to quit, 'r' to force a re-alignment)
"""

import os
import time
import urllib.request

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# --------------------------------------------------------------------
# 1. Pose model (downloaded automatically on first run, ~5-9 MB)
# --------------------------------------------------------------------
MODEL_PATH = "pose_landmarker_lite.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)


def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("Downloading pose landmarker model (one-time)...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Done.")


# --------------------------------------------------------------------
# 2. Landmark helpers
# --------------------------------------------------------------------
PL = mp_vision.PoseLandmark
VISIBILITY_THRESHOLD = 0.5


def calculate_angle(a, b, c):
    """Angle in degrees at point b, formed by the lines b->a and b->c."""
    a, b, c = np.array(a), np.array(b), np.array(c)
    radians = (np.arctan2(c[1] - b[1], c[0] - b[0]) -
               np.arctan2(a[1] - b[1], a[0] - b[0]))
    angle = np.abs(radians * 180.0 / np.pi)
    return 360 - angle if angle > 180.0 else angle


def pick_side(landmarks):
    """MediaPipe usually only gets a clean read on whichever side of the
    body faces the camera. Pick left or right based on which one it's
    more confident about."""
    left_ids = (PL.LEFT_SHOULDER, PL.LEFT_ELBOW, PL.LEFT_WRIST, PL.LEFT_HIP)
    right_ids = (PL.RIGHT_SHOULDER, PL.RIGHT_ELBOW, PL.RIGHT_WRIST, PL.RIGHT_HIP)

    left_vis = sum(landmarks[i].visibility for i in left_ids) / 4
    right_vis = sum(landmarks[i].visibility for i in right_ids) / 4

    if left_vis >= right_vis:
        return (PL.LEFT_SHOULDER, PL.LEFT_ELBOW, PL.LEFT_WRIST, PL.LEFT_HIP, PL.LEFT_ANKLE), left_vis
    return (PL.RIGHT_SHOULDER, PL.RIGHT_ELBOW, PL.RIGHT_WRIST, PL.RIGHT_HIP, PL.RIGHT_ANKLE), right_vis


def get_points(landmarks, ids, w, h):
    s, e, wr, hp, an = ids
    return (
        [landmarks[s].x * w, landmarks[s].y * h],
        [landmarks[e].x * w, landmarks[e].y * h],
        [landmarks[wr].x * w, landmarks[wr].y * h],
        [landmarks[hp].x * w, landmarks[hp].y * h],
        [landmarks[an].x * w, landmarks[an].y * h],
    )


MAX_BODY_TILT_DEG = 40  # how far from horizontal the torso/legs may be and still count as "in plank"


def tilt_from_horizontal(p1, p2):
    """0 = the line between the two points is perfectly horizontal,
    90 = perfectly vertical. Used to tell a horizontal plank apart from
    an upright body (standing, kneeling, sitting)."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    return float(np.degrees(np.arctan2(abs(dy), abs(dx) + 1e-6)))


def is_plank_orientation(shoulder, hip, ankle, max_tilt_deg=MAX_BODY_TILT_DEG):
    """Elbow/back angles alone can't tell a real push-up from someone
    kneeling upright and just swinging their arm - both produce the same
    joint angles. This checks that the shoulder-hip-ankle line is actually
    lying down (close to horizontal in the image) rather than upright."""
    torso_tilt = tilt_from_horizontal(shoulder, hip)
    leg_tilt = tilt_from_horizontal(hip, ankle)
    is_horizontal = torso_tilt <= max_tilt_deg and leg_tilt <= max_tilt_deg
    return is_horizontal, torso_tilt, leg_tilt


class Smoother:
    """Simple exponential moving average to stop single noisy frames from
    flipping the rep state back and forth."""
    def __init__(self, alpha=0.4):
        self.alpha = alpha
        self.value = None

    def update(self, new_value):
        if self.value is None:
            self.value = new_value
        else:
            self.value = self.alpha * new_value + (1 - self.alpha) * self.value
        return self.value

    def reset(self):
        self.value = None


# --------------------------------------------------------------------
# 3. Alignment / calibration step
# --------------------------------------------------------------------
class Calibrator:
    """Waits for the user to hold a valid push-up starting position
    (arms extended, back straight, clearly visible) for `hold_seconds`,
    then hands back personalized angle thresholds for that person/camera
    setup instead of relying on one-size-fits-all numbers."""

    def __init__(self, hold_seconds=1.5, min_up_angle=150, min_back_straight=155):
        self.hold_seconds = hold_seconds
        self.min_up_angle = min_up_angle
        self.min_back_straight = min_back_straight
        self.hold_start = None
        self.elbow_samples = []
        self.back_samples = []

    def reset(self):
        self.hold_start = None
        self.elbow_samples = []
        self.back_samples = []

    def update(self, elbow_angle, back_angle, confidence, plank_ok):
        """Returns (is_calibrated, progress_0_to_1, thresholds_or_None)."""
        aligned = (
            confidence >= VISIBILITY_THRESHOLD
            and elbow_angle >= self.min_up_angle
            and back_angle >= self.min_back_straight
            and plank_ok
        )

        if not aligned:
            self.reset()
            return False, 0.0, None

        now = time.time()
        if self.hold_start is None:
            self.hold_start = now
        self.elbow_samples.append(elbow_angle)
        self.back_samples.append(back_angle)

        held_for = now - self.hold_start
        progress = min(held_for / self.hold_seconds, 1.0)

        if held_for < self.hold_seconds:
            return False, progress, None

        calibrated_elbow = float(np.mean(self.elbow_samples))
        calibrated_back = float(np.mean(self.back_samples))

        # Personalize thresholds around what this person's "straight" reads
        # as on camera, instead of assuming a textbook 180 degrees.
        down_thresh = float(np.clip(calibrated_elbow - 65, 70, 110))
        up_thresh = float(np.clip(calibrated_elbow - 15, 140, 175))
        up_thresh = max(up_thresh, down_thresh + 20)
        back_straight_min = float(np.clip(calibrated_back - 12, 140, 170))

        thresholds = {
            "down_thresh": down_thresh,
            "up_thresh": up_thresh,
            "back_straight_min": back_straight_min,
        }
        return True, 1.0, thresholds


# --------------------------------------------------------------------
# 4. Rep-counting / form-checking state machine
# --------------------------------------------------------------------
class PushupCounter:
    def __init__(self, down_thresh=95, up_thresh=155, back_straight_min=155):
        self.down_thresh = down_thresh          # elbow angle below this = "down"
        self.up_thresh = up_thresh              # elbow angle above this = "up"
        self.back_straight_min = back_straight_min

        self.count = 0
        self.stage = "up"
        self.min_elbow_in_rep = 180.0
        self.back_broke_form = False
        self.feedback = "Go!"

    def update(self, elbow_angle, back_angle):
        self.min_elbow_in_rep = min(self.min_elbow_in_rep, elbow_angle)
        if back_angle < self.back_straight_min:
            self.back_broke_form = True

        if self.stage == "up" and elbow_angle < self.down_thresh:
            self.stage = "down"

        elif self.stage == "down" and elbow_angle > self.up_thresh:
            good_depth = self.min_elbow_in_rep < self.down_thresh
            good_back = not self.back_broke_form

            if good_depth and good_back:
                self.count += 1
                self.feedback = "Good rep!"
            elif not good_depth:
                self.feedback = "Go lower - not full range of motion"
            else:
                self.feedback = "Keep your back/hips in a straight line"

            self.stage = "up"
            self.min_elbow_in_rep = 180.0
            self.back_broke_form = False

        return self.count, self.stage, self.feedback


# --------------------------------------------------------------------
# 5. Skeleton + UI drawing
# --------------------------------------------------------------------
def draw_pose(image_bgr, pose_landmarks):
    mp_vision.drawing_utils.draw_landmarks(
        image_bgr,
        pose_landmarks,
        connections=mp_vision.PoseLandmarksConnections.POSE_LANDMARKS,
        landmark_drawing_spec=mp_vision.drawing_styles.get_default_pose_landmarks_style(),
    )


def draw_align_ui(frame, progress, hint):
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, 0), (w, 110), (30, 30, 30), -1)
    cv2.putText(frame, "Get into push-up starting position", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, "Arms straight, body straight, side-on to camera. Hold still.",
                (10, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, hint, (10, 82),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 1, cv2.LINE_AA)

    bar_x, bar_y, bar_w, bar_h = 10, 92, w - 20, 12
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (80, 80, 80), -1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + int(bar_w * progress), bar_y + bar_h),
                  (0, 255, 0), -1)


def draw_tracking_ui(frame, count, stage, feedback):
    cv2.rectangle(frame, (0, 0), (360, 95), (30, 30, 30), -1)
    cv2.putText(frame, f"REPS: {count}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2, cv2.LINE_AA)
    cv2.putText(frame, f"STAGE: {stage}", (10, 58),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, feedback, (10, 84),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 1, cv2.LINE_AA)


# --------------------------------------------------------------------
# 6. Main loop
# --------------------------------------------------------------------
def main():
    ensure_model()

    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open webcam.")
        return

    start_time = time.time()

    app_state = "ALIGN"          # "ALIGN" -> "TRACKING"
    calibrator = Calibrator()
    counter = None
    elbow_smoother = Smoother(alpha=0.4)
    back_smoother = Smoother(alpha=0.4)

    LOST_LIMIT_SEC = 1.5         # how long we tolerate losing the person before re-aligning
    lost_since = None

    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((time.time() - start_time) * 1000)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            detected = bool(result.pose_landmarks)
            elbow_angle = back_angle = None
            plank_ok = False
            confidence = 0.0

            if detected:
                landmarks = result.pose_landmarks[0]
                ids, confidence = pick_side(landmarks)

                if confidence >= VISIBILITY_THRESHOLD:
                    shoulder, elbow, wrist, hip, ankle = get_points(landmarks, ids, w, h)
                    raw_elbow_angle = calculate_angle(shoulder, elbow, wrist)
                    raw_back_angle = calculate_angle(shoulder, hip, ankle)
                    elbow_angle = elbow_smoother.update(raw_elbow_angle)
                    back_angle = back_smoother.update(raw_back_angle)
                    plank_ok, torso_tilt, leg_tilt = is_plank_orientation(shoulder, hip, ankle)

                    tip_color = (255, 255, 255) if plank_ok else (0, 0, 255)
                    cv2.putText(frame, f"{int(elbow_angle)} deg", tuple(np.int32(elbow)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, tip_color, 2, cv2.LINE_AA)

                draw_pose(frame, landmarks)

            have_good_reading = detected and confidence >= VISIBILITY_THRESHOLD

            # --- track whether we've "lost" the person while in TRACKING ---
            if app_state == "TRACKING":
                if not have_good_reading:
                    if lost_since is None:
                        lost_since = time.time()
                    elif time.time() - lost_since > LOST_LIMIT_SEC:
                        app_state = "ALIGN"
                        calibrator.reset()
                        elbow_smoother.reset()
                        back_smoother.reset()
                else:
                    lost_since = None

            key = cv2.waitKey(1) & 0xFF
            if key == ord('r'):
                app_state = "ALIGN"
                calibrator.reset()
                elbow_smoother.reset()
                back_smoother.reset()

            # --- state behavior ---
            if app_state == "ALIGN":
                if have_good_reading:
                    is_calibrated, progress, thresholds = calibrator.update(
                        elbow_angle, back_angle, confidence, plank_ok)
                    if progress >= 1.0:
                        hint = "Locked in!"
                    elif not plank_ok:
                        hint = "Get down onto the floor - body needs to be horizontal"
                    else:
                        hint = "Hold..."
                else:
                    is_calibrated, progress, thresholds = False, 0.0, None
                    hint = "No person detected - step into frame, side-on to the camera"

                draw_align_ui(frame, progress, hint)

                if is_calibrated:
                    prev_count = counter.count if counter else 0
                    counter = PushupCounter(**thresholds)
                    counter.count = prev_count
                    app_state = "TRACKING"

            else:  # TRACKING
                if not have_good_reading:
                    count, stage = counter.count, counter.stage
                    feedback = "Lost tracking - hold position..."
                elif not plank_ok:
                    count, stage = counter.count, counter.stage
                    feedback = "Not in plank position - counting paused"
                else:
                    count, stage, feedback = counter.update(elbow_angle, back_angle)
                draw_tracking_ui(frame, count, stage, feedback)

            cv2.imshow("Push-up Tracker (q: quit, r: re-align)", frame)
            if key == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()