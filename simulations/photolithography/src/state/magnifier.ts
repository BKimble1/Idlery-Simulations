/**
 * The magnified inset (round four): details too small to see at machine scale — the film of
 * water between a DUV scanner's last lens element and the wafer, about a millimetre — are shown
 * in a clearly titled inset beside the picture, never by making the machine itself implausible.
 * A machine scene publishes what the inset should show, from the same progress as everything
 * else it draws (so seeking and replaying give the same inset); the page draws it
 * (ui/Magnifier.tsx).
 */
import { create } from 'zustand';

export interface MagnifierState {
  /** What the inset shows, or null when it is off. */
  kind: 'immersion' | null;
  /** The learner has asked to see the light path (invisible radiation is drawn only then). */
  lightPath: boolean;
}

export const useMagnifier = create<MagnifierState>(() => ({ kind: null, lightPath: false }));

/**
 * Mutable copy of the per-frame values, written by the scene's progress frame and read by the
 * inset directly (not through React).
 */
export const magnifierFrame = {
  /** Immersion: the wafer stage's position along the scan direction (m). */
  waferZ: 0,
  /** A field is being exposed (the slit is lit). */
  exposing: false,
  /**
   * Set by the inset while it is shown, and called by the scene after it writes the values
   * above: the inset is redrawn with the frame it belongs to (also when frames are rendered on
   * request, in virtual time), without a render of React or an animation loop of its own.
   */
  draw: null as null | (() => void),
};

/**
 * While a machine draws invisible radiation as an overlay (the scanner's 193 nm light path), it
 * says so here, and the page says so on the picture (ui/Viewport.tsx, `ScaleLabel`): the path
 * is an explanation, not something anyone at the machine could see.
 */
export const useOverlayNote = create<{ note: string | null }>(() => ({ note: null }));
