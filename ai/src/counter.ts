/**
 * counter.ts
 * ----------
 * Rep-counting state machine with form validation.
 *
 * Port of the Python prototype's `PushupCounter` class.
 * See /docs/rep-validity-rules.md for the full spec.
 */

import type { RepFeedback, RepStage, RepState } from "./types.js";

export interface CounterOptions {
  downThresh: number;
  upThresh: number;
  backStraightMin: number;
}

export class PushupCounter {
  readonly downThresh: number;
  readonly upThresh: number;
  readonly backStraightMin: number;

  private _count: number;
  private _stage: RepStage = "up";
  private minElbowInRep = 180;
  private backBrokeForm = false;
  private _feedback: RepFeedback = "Go!";

  constructor(options: CounterOptions, initialCount = 0) {
    this.downThresh = options.downThresh;
    this.upThresh = options.upThresh;
    this.backStraightMin = options.backStraightMin;
    this._count = initialCount;
  }

  get count(): number {
    return this._count;
  }

  get stage(): RepStage {
    return this._stage;
  }

  get feedback(): RepFeedback {
    return this._feedback;
  }

  get state(): RepState {
    return { count: this._count, stage: this._stage, feedback: this._feedback };
  }

  /**
   * Feed one frame's angle readings into the state machine.
   * @returns The updated RepState.
   */
  update(elbowAngle: number, backAngle: number): RepState {
    // Track minimum elbow in this rep (for depth check)
    this.minElbowInRep = Math.min(this.minElbowInRep, elbowAngle);

    // Accumulate form failures
    if (backAngle < this.backStraightMin) {
      this.backBrokeForm = true;
    }

    // UP → DOWN
    if (this._stage === "up" && elbowAngle < this.downThresh) {
      this._stage = "down";
    }
    // DOWN → UP (rep attempt complete)
    else if (this._stage === "down" && elbowAngle > this.upThresh) {
      const goodDepth = this.minElbowInRep < this.downThresh;
      const goodBack = !this.backBrokeForm;

      if (goodDepth && goodBack) {
        this._count++;
        this._feedback = "Good rep!";
      } else if (!goodDepth) {
        this._feedback = "Go lower - not full range of motion";
      } else {
        this._feedback = "Keep your back/hips in a straight line";
      }

      // Reset per-rep tracking
      this._stage = "up";
      this.minElbowInRep = 180;
      this.backBrokeForm = false;
    }

    return this.state;
  }
}
