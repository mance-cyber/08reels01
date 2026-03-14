import { describe, it, expect } from 'vitest';
import type { Annotation } from '@/lib/types';

// Extract the visibility logic as a pure function for testing.
// This mirrors the logic that will live in use-annotations.ts
import { isAnnotationVisible } from '@/components/video/annotations/visibility';

function makeAnnotation(id: string, timecode: number, commentId = 'comment-1'): Annotation {
  return {
    id,
    commentId,
    type: 'pen',
    data: { path: [{ x: 0, y: 0 }], color: '#FF0000', lineWidth: 3 },
    author: { id: 'user-1', name: 'Test' },
    createdAt: new Date().toISOString(),
    timecode,
  };
}

describe('isAnnotationVisible', () => {
  // --- During playback (not annotating): 0.5 second window ---

  it('should be visible when currentTime equals annotation timecode', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 5.0, false)).toBe(true);
  });

  it('should be visible when currentTime is within 0.5s after timecode', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 5.3, false)).toBe(true);
  });

  it('should NOT be visible at exactly timecode + 0.5', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 5.5, false)).toBe(false);
  });

  it('should NOT be visible when currentTime is before timecode', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 4.9, false)).toBe(false);
  });

  it('should NOT be visible when currentTime is well past timecode', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 6.0, false)).toBe(false);
  });

  it('should handle timecode at 0', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 0), 0, false)).toBe(true);
    expect(isAnnotationVisible(makeAnnotation('1', 0), 0.4, false)).toBe(true);
    expect(isAnnotationVisible(makeAnnotation('1', 0), 0.5, false)).toBe(false);
  });

  // --- During annotation mode: show all at comment's timecode ---

  it('should show annotation at matching timecode when annotating', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 5.0, true)).toBe(true);
  });

  it('should show annotation when annotating and times are close (same floor)', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 5.7, true)).toBe(true);
  });

  it('should NOT show annotation from different timecode when annotating', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 5.0), 6.0, true)).toBe(false);
  });

  // --- Edge cases ---

  it('should handle fractional timecodes', () => {
    expect(isAnnotationVisible(makeAnnotation('1', 3.7), 3.7, false)).toBe(true);
    expect(isAnnotationVisible(makeAnnotation('1', 3.7), 4.0, false)).toBe(true);
    expect(isAnnotationVisible(makeAnnotation('1', 3.7), 4.19, false)).toBe(true);
    // 3.7 + 0.5 = 4.2, so at 4.2 the annotation should no longer be visible
    expect(isAnnotationVisible(makeAnnotation('1', 3.7), 4.2, false)).toBe(false);
  });

  it('should handle negative timecodes gracefully', () => {
    // Negative timecodes should not crash, just not be visible at positive times
    expect(isAnnotationVisible(makeAnnotation('1', -1), 0, false)).toBe(false);
  });
});
