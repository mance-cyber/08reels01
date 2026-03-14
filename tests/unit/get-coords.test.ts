import { describe, it, expect } from 'vitest';
import { getCanvasCoords } from '@/components/video/annotations/coords';

describe('getCanvasCoords', () => {
  // Simulates a canvas that renders at 1920x1080 internal resolution
  // but is displayed at 960x540 on screen

  function makeCanvas(internalWidth: number, internalHeight: number, displayWidth: number, displayHeight: number) {
    return {
      width: internalWidth,
      height: internalHeight,
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: displayWidth,
        height: displayHeight,
        right: 100 + displayWidth,
        bottom: 50 + displayHeight,
        x: 100,
        y: 50,
        toJSON: () => {},
      }),
    } as unknown as HTMLCanvasElement;
  }

  it('should compute coords from canvas element dimensions (not container)', () => {
    const canvas = makeCanvas(1920, 1080, 960, 540);
    // Click at screen position (580, 320) => relative to canvas: (480, 270)
    // Scale: 1920/960 = 2, 1080/540 = 2
    // Canvas coords: (480 * 2, 270 * 2) = (960, 540)
    const result = getCanvasCoords(580, 320, canvas);
    expect(result.x).toBeCloseTo(960);
    expect(result.y).toBeCloseTo(540);
  });

  it('should handle 1:1 scale (no scaling)', () => {
    const canvas = makeCanvas(1920, 1080, 1920, 1080);
    // Click at (200, 150) relative to canvas rect start (100, 50)
    // => relative: (100, 100)
    // Scale: 1:1
    const result = getCanvasCoords(200, 150, canvas);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(100);
  });

  it('should handle non-uniform scaling', () => {
    // Canvas is 1920x1080 but displayed in a 640x480 box (different aspect ratio)
    const canvas = makeCanvas(1920, 1080, 640, 480);
    // ScaleX = 1920/640 = 3, ScaleY = 1080/480 = 2.25
    // Click at (420, 290) => relative: (320, 240)
    // Canvas coords: (320 * 3, 240 * 2.25) = (960, 540)
    const result = getCanvasCoords(420, 290, canvas);
    expect(result.x).toBeCloseTo(960);
    expect(result.y).toBeCloseTo(540);
  });

  it('should handle click at top-left corner of canvas', () => {
    const canvas = makeCanvas(1920, 1080, 960, 540);
    // Canvas rect starts at (100, 50), click at (100, 50)
    const result = getCanvasCoords(100, 50, canvas);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('should handle click at bottom-right corner of canvas', () => {
    const canvas = makeCanvas(1920, 1080, 960, 540);
    // Canvas rect starts at (100, 50), display 960x540
    // Click at (1060, 590) => relative: (960, 540) => canvas: (1920, 1080)
    const result = getCanvasCoords(1060, 590, canvas);
    expect(result.x).toBeCloseTo(1920);
    expect(result.y).toBeCloseTo(1080);
  });

  it('should handle touch events (same logic with clientX/clientY)', () => {
    const canvas = makeCanvas(1920, 1080, 960, 540);
    const result = getCanvasCoords(580, 320, canvas);
    expect(result.x).toBeCloseTo(960);
    expect(result.y).toBeCloseTo(540);
  });
});
