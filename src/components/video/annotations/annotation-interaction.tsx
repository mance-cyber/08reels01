'use client';

import { useState, useCallback, useRef } from 'react';
import type { Annotation, ImageAnnotationData, TextAnnotationData, PenAnnotationData } from '@/lib/types';
import type { AnnotationMode, InteractionAction, Point, HandlePosition, CanvasScale } from './types';
import { isPointInRotatedRect, getHandleAtPoint, calculateHandleSize } from './utils';
import { getCanvasCoords } from './coords';

interface UseAnnotationInteractionProps {
  readonly annotations: readonly Annotation[];
  readonly annotationMode: AnnotationMode;
  readonly penColor: string;
  readonly penLineWidth: number;
  readonly isAnnotating: boolean;
  readonly canvasScale: CanvasScale;
  readonly onAddPen: (data: PenAnnotationData) => void;
  readonly onUpdateAnnotation: (annotation: Annotation) => void;
  readonly onEnterTextMode: (canvasCoords: Point) => void;
  readonly onSelectAnnotation: (id: string | null) => void;
  readonly onDoubleClickText: (annotation: Annotation) => void;
}

export function useAnnotationInteraction({
  annotations,
  annotationMode,
  penColor,
  penLineWidth,
  isAnnotating,
  canvasScale,
  onAddPen,
  onUpdateAnnotation,
  onEnterTextMode,
  onSelectAnnotation,
  onDoubleClickText,
}: UseAnnotationInteractionProps) {
  const [action, setAction] = useState<InteractionAction>('none');
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const activeCornerRef = useRef<HandlePosition | null>(null);

  // Mutable ref for pen path to avoid O(n^2) array copies during drawing
  const pathRef = useRef<Point[]>([]);
  const [pathTick, setPathTick] = useState(0);

  const getCoords = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = event.currentTarget as HTMLCanvasElement;

    let clientX: number, clientY: number;
    if ('touches' in event.nativeEvent) {
      clientX = event.nativeEvent.touches[0].clientX;
      clientY = event.nativeEvent.touches[0].clientY;
    } else {
      clientX = (event.nativeEvent as MouseEvent).clientX;
      clientY = (event.nativeEvent as MouseEvent).clientY;
    }

    return getCanvasCoords(clientX, clientY, canvas);
  }, []);

  const findAnnotationAtPoint = useCallback((point: Point): Annotation | null => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === 'image' || ann.type === 'text') {
        const data = ann.data as ImageAnnotationData | TextAnnotationData;
        if (isPointInRotatedRect(point, { ...data, rotation: data.rotation })) {
          return ann;
        }
      }
    }
    return null;
  }, [annotations]);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isAnnotating) return;
    const point = getCoords(e);
    setStartPoint(point);

    if (annotationMode === 'pen') {
      setAction('drawing');
      pathRef.current = [point];
      setPathTick(t => t + 1);
      return;
    }

    if (annotationMode === 'text') {
      onEnterTextMode(point);
      return;
    }

    // Select mode: check handles first if something is already selected
    if (selectedAnnotationId) {
      const selected = annotations.find(a => a.id === selectedAnnotationId);
      if (selected && (selected.type === 'image' || selected.type === 'text')) {
        const data = selected.data as ImageAnnotationData | TextAnnotationData;
        const { hit } = calculateHandleSize(canvasScale.displayWidth, 1);
        const hitRadius = hit * canvasScale.scaleX;
        const handle = getHandleAtPoint(point, { ...data, rotation: data.rotation }, hitRadius);
        if (handle) {
          activeCornerRef.current = handle;
          if (handle === 'rotation') {
            setAction('rotating');
          } else {
            setAction('resizing');
          }
          return;
        }
      }
    }

    // Check for click on annotation
    const clicked = findAnnotationAtPoint(point);
    const newId = clicked?.id || null;
    setSelectedAnnotationId(newId);
    onSelectAnnotation(newId);

    if (clicked) {
      setAction('dragging');
    } else {
      setAction('none');
    }
  }, [isAnnotating, annotationMode, getCoords, selectedAnnotationId, annotations, canvasScale, findAnnotationAtPoint, onEnterTextMode, onSelectAnnotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (action === 'none' || !startPoint) return;
    const point = getCoords(e);

    if (action === 'drawing') {
      pathRef.current.push(point);
      setPathTick(t => t + 1);
      return;
    }

    const selected = annotations.find(a => a.id === selectedAnnotationId);
    if (!selected || (selected.type !== 'image' && selected.type !== 'text')) return;

    const data = { ...selected.data } as ImageAnnotationData | TextAnnotationData;
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;

    if (action === 'dragging') {
      const updated = { ...data, x: data.x + dx, y: data.y + dy };
      onUpdateAnnotation({ ...selected, data: updated });
    } else if (action === 'resizing') {
      const sinR = Math.sin(data.rotation);
      const cosR = Math.cos(data.rotation);
      const rotatedDx = dx * cosR + dy * sinR;
      const rotatedDy = dy * cosR - dx * sinR;

      const newWidth = Math.max(20, data.width + rotatedDx);
      if (selected.type === 'image') {
        // Default: aspect-ratio locked. Shift for free resize.
        const shiftKey = 'nativeEvent' in e && (e.nativeEvent as MouseEvent).shiftKey;
        const aspectRatio = data.width / (data as ImageAnnotationData).height;
        const newHeight = shiftKey
          ? Math.max(20, (data as ImageAnnotationData).height + rotatedDy)
          : newWidth / aspectRatio;
        onUpdateAnnotation({
          ...selected,
          data: { ...data, width: newWidth, height: newHeight } as ImageAnnotationData,
        });
      } else {
        const newHeight = Math.max(20, (data as TextAnnotationData).height + rotatedDy);
        onUpdateAnnotation({
          ...selected,
          data: { ...data, width: newWidth, height: newHeight } as TextAnnotationData,
        });
      }
    } else if (action === 'rotating') {
      const cx = data.x + data.width / 2;
      const cy = data.y + data.height / 2;
      const startAngle = Math.atan2(startPoint.y - cy, startPoint.x - cx);
      const currentAngle = Math.atan2(point.y - cy, point.x - cx);
      const updated = { ...data, rotation: data.rotation + (currentAngle - startAngle) };
      onUpdateAnnotation({ ...selected, data: updated });
    }

    setStartPoint(point);
  }, [action, startPoint, getCoords, annotations, selectedAnnotationId, onUpdateAnnotation]);

  const handleMouseUp = useCallback(() => {
    if (action === 'drawing' && pathRef.current.length > 1) {
      onAddPen({ path: [...pathRef.current], color: penColor, lineWidth: penLineWidth });
    }
    setAction('none');
    setStartPoint(null);
    pathRef.current = [];
    setPathTick(t => t + 1);
    activeCornerRef.current = null;
  }, [action, penColor, penLineWidth, onAddPen]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isAnnotating) return;
    const point = getCoords(e);
    const clicked = findAnnotationAtPoint(point);
    if (clicked?.type === 'text') {
      onDoubleClickText(clicked);
    }
  }, [isAnnotating, getCoords, findAnnotationAtPoint, onDoubleClickText]);

  const deselect = useCallback(() => {
    setSelectedAnnotationId(null);
    onSelectAnnotation(null);
  }, [onSelectAnnotation]);

  return {
    selectedAnnotationId,
    currentPath: pathRef.current as readonly Point[],
    pathTick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    deselect,
    setSelectedAnnotationId: (id: string | null) => {
      setSelectedAnnotationId(id);
      onSelectAnnotation(id);
    },
  };
}
