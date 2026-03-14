'use client';

import { Pen, MousePointer2, Loader2, Type, Image as ImageIcon, Undo2, Redo2, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { AnnotationMode } from './types';

interface AnnotationToolbarProps {
  readonly mode: AnnotationMode;
  readonly onModeChange: (mode: AnnotationMode) => void;
  readonly color: string;
  readonly onColorChange: (color: string) => void;
  readonly lineWidth: number;
  readonly onLineWidthChange: (width: number) => void;
  readonly onDone: () => void;
  readonly isUploading: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

const colors = ['#FF0000', '#FFFF00', '#0000FF', '#FFFFFF', '#000000'];
const lineWidths = [2, 5, 10];

export default function AnnotationToolbar({
  mode,
  onModeChange,
  color,
  onColorChange,
  lineWidth,
  onLineWidthChange,
  onDone,
  isUploading,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: AnnotationToolbarProps) {
  const [doneState, setDoneState] = useState<'idle' | 'saving'>('idle');

  const handleDone = async () => {
    setDoneState('saving');
    try {
      await onDone();
    } finally {
      setDoneState('idle');
    }
  };

  return (
    <div className="bg-card/80 backdrop-blur-sm border rounded-lg p-2 flex items-center gap-2 shadow-lg">
      <ToggleGroup type="single" value={mode} onValueChange={(v) => v && onModeChange(v as AnnotationMode)}>
        <ToggleGroupItem value="select" aria-label="選取">
          <MousePointer2 className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="pen" aria-label="畫筆">
          <Pen className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="text" aria-label="文字">
          <Type className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="image" aria-label="圖片">
          <ImageIcon className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {(mode === 'pen' || mode === 'text') && (
        <>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <Button
                key={c}
                variant="outline"
                size="icon"
                className={cn('h-6 w-6 rounded-full p-0 border-2', color === c ? 'border-primary' : 'border-transparent')}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
        </>
      )}

      {mode === 'pen' && (
        <>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            {lineWidths.map((w) => (
              <Button
                key={w}
                variant={lineWidth === w ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => onLineWidthChange(w)}
              >
                <div className="bg-foreground rounded-full" style={{ width: w + 2, height: w + 2 }} />
              </Button>
            ))}
          </div>
        </>
      )}

      <Separator orientation="vertical" className="h-6 ml-auto" />

      {/* Undo/Redo */}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo} title="復原 (Ctrl+Z)">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {isUploading ? (
        <Button variant="outline" size="icon" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      ) : (
        <Button
          onClick={handleDone}
          disabled={doneState === 'saving'}
          title="完成"
          className="gap-1.5"
        >
          {doneState === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          完成
        </Button>
      )}
    </div>
  );
}
