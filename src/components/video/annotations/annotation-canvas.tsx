'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Annotation, PenAnnotationData, ImageAnnotationData, TextAnnotationData } from '@/lib/types';
import type { AnnotationMode, Point } from './types';
import { drawSelectionHandles } from './selection-handles';
import { calculateActualFontSize, wrapText } from './utils';

interface AnnotationCanvasProps {
  readonly width: number;
  readonly height: number;
  readonly annotations: readonly Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly annotationMode: AnnotationMode;
  readonly penColor: string;
  readonly penLineWidth: number;
  readonly isAnnotating: boolean;
  readonly currentPath: readonly Point[];
  readonly pathTick: number;
  readonly onMouseDown: (e: React.MouseEvent | React.TouchEvent) => void;
  readonly onMouseMove: (e: React.MouseEvent | React.TouchEvent) => void;
  readonly onMouseUp: () => void;
  readonly onDoubleClick: (e: React.MouseEvent) => void;
}

export default function AnnotationCanvas({
  width,
  height,
  annotations,
  selectedAnnotationId,
  annotationMode,
  penColor,
  penLineWidth,
  isAnnotating,
  currentPath,
  pathTick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDoubleClick,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageTick, setImageTick] = useState(0);

  const getDisplayWidth = useCallback(() => {
    return canvasRef.current?.getBoundingClientRect().width || width;
  }, [width]);

  const drawPen = useCallback((ctx: CanvasRenderingContext2D, data: PenAnnotationData) => {
    if (data.path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(data.path[0].x, data.path[0].y);
    for (let i = 1; i < data.path.length; i++) {
      ctx.lineTo(data.path[i].x, data.path[i].y);
    }
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, []);

  const drawImage = useCallback((ctx: CanvasRenderingContext2D, data: ImageAnnotationData, isSelected: boolean) => {
    const img = imageCache.current.get(data.url);
    if (!img) {
      const newImg = new Image();
      newImg.crossOrigin = 'anonymous';
      newImg.src = data.url;
      newImg.onload = () => {
        imageCache.current.set(data.url, newImg);
        // Trigger re-render to redraw with loaded image (avoids stale closure)
        setImageTick(t => t + 1);
      };
      return;
    }

    ctx.save();
    ctx.translate(data.x + data.width / 2, data.y + data.height / 2);
    ctx.rotate(data.rotation);
    ctx.drawImage(img, -data.width / 2, -data.height / 2, data.width, data.height);
    ctx.restore();

    if (isSelected) {
      drawSelectionHandles(ctx, data, getDisplayWidth());
    }
  }, [getDisplayWidth]);

  const drawText = useCallback((ctx: CanvasRenderingContext2D, data: TextAnnotationData, isSelected: boolean) => {
    ctx.save();
    ctx.translate(data.x + data.width / 2, data.y + data.height / 2);
    ctx.rotate(data.rotation);

    // Background
    if (data.backgroundColor) {
      const padding = 4;
      ctx.fillStyle = data.backgroundColor;
      ctx.fillRect(
        -data.width / 2 - padding,
        -data.height / 2 - padding,
        data.width + padding * 2,
        data.height + padding * 2,
      );
    }

    // Word-wrapped text rendering
    const actualFontSize = calculateActualFontSize(data.fontSize, height);
    ctx.font = `500 ${actualFontSize}px sans-serif`;
    ctx.fillStyle = data.color;
    ctx.textBaseline = 'top';

    const measureFn = (text: string) => ctx.measureText(text).width;
    const lines = wrapText(data.text, data.width, measureFn);
    const lineHeight = actualFontSize * 1.2;

    const totalTextHeight = lines.length * lineHeight;
    const startY = -totalTextHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const lineWidth = ctx.measureText(lines[i]).width;
      ctx.fillText(lines[i], -lineWidth / 2, startY + i * lineHeight);
    }

    ctx.restore();

    if (isSelected) {
      drawSelectionHandles(ctx, data, getDisplayWidth());
    }
  }, [height, getDisplayWidth]);

  // Redraw canvas whenever dependencies change
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const annotation of annotations) {
      const isSelected = annotation.id === selectedAnnotationId;
      switch (annotation.type) {
        case 'pen':
          drawPen(ctx, annotation.data as PenAnnotationData);
          break;
        case 'image':
          drawImage(ctx, annotation.data as ImageAnnotationData, isSelected);
          break;
        case 'text':
          drawText(ctx, annotation.data as TextAnnotationData, isSelected);
          break;
      }
    }

    // Current drawing path
    if (currentPath.length > 1) {
      drawPen(ctx, { path: [...currentPath], color: penColor, lineWidth: penLineWidth });
    }
  }, [annotations, selectedAnnotationId, currentPath, pathTick, penColor, penLineWidth, drawPen, drawImage, drawText, imageTick]);

  const cursor = () => {
    if (annotationMode === 'pen') return 'crosshair';
    if (annotationMode === 'text') return 'text';
    return 'default';
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onMouseDown}
      onTouchMove={onMouseMove}
      onTouchEnd={onMouseUp}
      onDoubleClick={onDoubleClick}
      className="absolute top-0 left-0 w-full h-full z-10"
      style={{
        pointerEvents: isAnnotating ? 'auto' : 'none',
        cursor: cursor(),
      }}
    />
  );
}
