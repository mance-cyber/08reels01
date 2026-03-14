import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationHistory } from '@/components/video/annotations/use-annotation-history';
import type { Annotation } from '@/lib/types';

function makeAnnotation(id: string, text: string = 'test'): Annotation {
  return {
    id,
    commentId: 'comment-1',
    type: 'text',
    data: {
      text,
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      fontSize: 32,
      color: '#FFFFFF',
      rotation: 0,
    },
    author: { id: 'user-1', name: 'Test User' },
    createdAt: new Date().toISOString(),
    timecode: 0,
  };
}

function makePenAnnotation(id: string): Annotation {
  return {
    id,
    commentId: 'comment-1',
    type: 'pen',
    data: {
      path: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#FF0000',
      lineWidth: 5,
    },
    author: { id: 'user-1', name: 'Test User' },
    createdAt: new Date().toISOString(),
    timecode: 0,
  };
}

describe('useAnnotationHistory', () => {
  // --- Initialization ---

  it('should initialize with empty annotations', () => {
    const { result } = renderHook(() => useAnnotationHistory());
    expect(result.current.annotations).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should initialize with provided annotations', () => {
    const initial = [makeAnnotation('1'), makeAnnotation('2')];
    const { result } = renderHook(() => useAnnotationHistory(initial));
    expect(result.current.annotations).toHaveLength(2);
  });

  // --- Add ---

  it('should add an annotation', () => {
    const { result } = renderHook(() => useAnnotationHistory());
    const annotation = makeAnnotation('1');

    act(() => {
      result.current.add(annotation);
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('1');
    expect(result.current.canUndo).toBe(true);
  });

  it('should add multiple annotations', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });
    act(() => {
      result.current.add(makePenAnnotation('2'));
    });

    expect(result.current.annotations).toHaveLength(2);
  });

  // --- Remove ---

  it('should remove an annotation', () => {
    const initial = [makeAnnotation('1'), makeAnnotation('2')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    act(() => {
      result.current.remove('1');
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('2');
    expect(result.current.canUndo).toBe(true);
  });

  it('should do nothing when removing non-existent annotation', () => {
    const initial = [makeAnnotation('1')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    act(() => {
      result.current.remove('non-existent');
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
  });

  // --- Update ---

  it('should update an annotation', () => {
    const initial = [makeAnnotation('1', 'before')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    const updated = makeAnnotation('1', 'after');
    act(() => {
      result.current.update('1', updated);
    });

    expect(result.current.annotations).toHaveLength(1);
    expect((result.current.annotations[0].data as any).text).toBe('after');
    expect(result.current.canUndo).toBe(true);
  });

  // --- Undo ---

  it('should undo an add operation', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });
    expect(result.current.annotations).toHaveLength(1);

    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('should undo a remove operation (restore deleted annotation)', () => {
    const initial = [makeAnnotation('1')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    act(() => {
      result.current.remove('1');
    });
    expect(result.current.annotations).toHaveLength(0);

    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('1');
  });

  it('should undo an update operation', () => {
    const initial = [makeAnnotation('1', 'before')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    act(() => {
      result.current.update('1', makeAnnotation('1', 'after'));
    });
    expect((result.current.annotations[0].data as any).text).toBe('after');

    act(() => {
      result.current.undo();
    });
    expect((result.current.annotations[0].data as any).text).toBe('before');
  });

  it('should do nothing when undo with empty history', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toEqual([]);
  });

  // --- Redo ---

  it('should redo an undone add operation', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toHaveLength(0);

    act(() => {
      result.current.redo();
    });
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.canRedo).toBe(false);
  });

  it('should redo an undone remove operation', () => {
    const initial = [makeAnnotation('1')];
    const { result } = renderHook(() => useAnnotationHistory(initial));

    act(() => {
      result.current.remove('1');
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toHaveLength(1);

    act(() => {
      result.current.redo();
    });
    expect(result.current.annotations).toHaveLength(0);
  });

  it('should do nothing when redo with empty future', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.redo();
    });
    expect(result.current.annotations).toEqual([]);
  });

  // --- Redo invalidation ---

  it('should clear redo history when a new action is performed after undo', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.add(makeAnnotation('2'));
    });
    expect(result.current.canRedo).toBe(false);
  });

  // --- Max history ---

  it('should limit history to 30 entries', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    for (let i = 0; i < 35; i++) {
      act(() => {
        result.current.add(makeAnnotation(`ann-${i}`));
      });
    }

    expect(result.current.annotations).toHaveLength(35);

    // Undo 30 times should work
    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.undo();
      });
    }
    expect(result.current.annotations).toHaveLength(5);

    // 31st undo should do nothing (history was capped at 30)
    act(() => {
      result.current.undo();
    });
    expect(result.current.annotations).toHaveLength(5);
  });

  // --- Clear history ---

  it('should clear all history on clearHistory', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });
    act(() => {
      result.current.add(makeAnnotation('2'));
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.annotations).toHaveLength(2); // annotations preserved
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  // --- setAnnotations ---

  it('should replace all annotations without adding to history', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => {
      result.current.add(makeAnnotation('1'));
    });

    act(() => {
      result.current.setAnnotations([makeAnnotation('a'), makeAnnotation('b'), makeAnnotation('c')]);
    });

    expect(result.current.annotations).toHaveLength(3);
    // setAnnotations should clear history since it is a full reset
    expect(result.current.canUndo).toBe(false);
  });

  // --- Multiple undo/redo chain ---

  it('should handle a sequence of undo and redo correctly', () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => result.current.add(makeAnnotation('1')));
    act(() => result.current.add(makeAnnotation('2')));
    act(() => result.current.add(makeAnnotation('3')));
    expect(result.current.annotations).toHaveLength(3);

    act(() => result.current.undo()); // remove 3
    act(() => result.current.undo()); // remove 2
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe('1');

    act(() => result.current.redo()); // re-add 2
    expect(result.current.annotations).toHaveLength(2);

    act(() => result.current.add(makeAnnotation('4'))); // new branch, clears redo of 3
    expect(result.current.annotations).toHaveLength(3);
    expect(result.current.canRedo).toBe(false);

    const ids = result.current.annotations.map(a => a.id);
    expect(ids).toEqual(['1', '2', '4']);
  });
});
