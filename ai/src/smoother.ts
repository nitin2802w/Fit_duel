/**
 * smoother.ts
 * -----------
 * Exponential Moving Average to prevent single noisy frames from flipping
 * the rep state machine back and forth.
 *
 * Port of the Python prototype's `Smoother` class.
 */

export class Smoother {
  private alpha: number;
  private _value: number | null = null;

  /**
   * @param alpha Smoothing factor [0, 1]. Higher = more responsive, lower = smoother.
   *              The Python prototype uses 0.4.
   */
  constructor(alpha = 0.4) {
    this.alpha = alpha;
  }

  get value(): number | null {
    return this._value;
  }

  update(newValue: number): number {
    if (this._value === null) {
      this._value = newValue;
    } else {
      this._value = this.alpha * newValue + (1 - this.alpha) * this._value;
    }
    return this._value;
  }

  reset(): void {
    this._value = null;
  }
}
