import type { Annotation } from '@/lib/types';

/**
 * Determines whether an annotation should be visible at the given time.
 *
 * During playback (isAnnotating=false):
 *   Visible for 0.5 seconds: currentTime >= timecode && currentTime < timecode + 0.5
 *   Instant appear/disappear, no fade.
 *
 * During annotation mode (isAnnotating=true):
 *   Show all annotations at the same integer-second timecode.
 */
export function isAnnotationVisible(
  annotation: Annotation,
  currentTime: number,
  isAnnotating: boolean,
): boolean {
  const timecode = annotation.timecode;

  if (isAnnotating) {
    // In annotation mode, show all annotations at the same integer-second timecode
    return Math.floor(timecode) === Math.floor(currentTime);
  }

  // During playback: visible for exactly 0.5 seconds
  return currentTime >= timecode && currentTime < timecode + 0.5;
}
