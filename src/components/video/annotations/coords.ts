import type { Point } from './types';

/**
 * Compute canvas-space coordinates from screen clientX/clientY,
 * using the canvas element's own getBoundingClientRect() for scale computation.
 *
 * This fixes the coordinate bug where container size was used instead of
 * the canvas element's actual rendered dimensions.
 */
export function getCanvasCoords(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
