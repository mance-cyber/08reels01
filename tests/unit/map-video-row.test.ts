import { describe, it, expect } from 'vitest';
import { mapVideoRow } from '@/supabase/db/map-video-row';
import type { Video } from '@/lib/types';

// --- Test fixtures ---

function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'video-1',
    title: 'Test Video',
    thumbnail_url: 'https://example.com/thumb.jpg',
    thumbnail_hint: 'thumb hint',
    author_id: 'author-1',
    author_name: 'Author',
    uploaded_at: '2025-01-01T00:00:00Z',
    video_url: 'https://example.com/video.mp4',
    assigned_user_ids: ['user-1'],
    is_deleted: false,
    deleted_at: null,
    versions: [],
    ...overrides,
  };
}

function makeVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    version_number: 1,
    status: 'pending_review',
    created_at: '2025-01-01T00:00:00Z',
    uploader_id: 'author-1',
    uploader_name: 'Author',
    is_current_active: true,
    video_url: 'https://example.com/video.mp4',
    qualities: [],
    notes: null,
    thumbnail_url: null,
    comments: [],
    ...overrides,
  };
}

function makeCommentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    timecode: 5.0,
    timecode_formatted: '00:00:05.000',
    text: 'Great shot!',
    author_id: 'user-1',
    author_name: 'Reviewer',
    created_at: '2025-01-01T00:00:00Z',
    annotations: [],
    ...overrides,
  };
}

function makeAnnotationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann-1',
    comment_id: 'comment-1',
    type: 'pen',
    data: { path: [{ x: 0, y: 0 }], color: '#FF0000', lineWidth: 3 },
    author_id: 'user-1',
    author_name: 'Reviewer',
    created_at: '2025-01-01T00:00:00Z',
    timecode: 5.0,
    ...overrides,
  };
}

describe('mapVideoRow', () => {
  it('should map a basic video row with no versions', () => {
    const row = makeDbRow();
    const result = mapVideoRow(row);

    expect(result.id).toBe('video-1');
    expect(result.title).toBe('Test Video');
    expect(result.author).toEqual({ id: 'author-1', name: 'Author' });
    expect(result.versions).toEqual([]);
  });

  it('should map versions with comments', () => {
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [makeCommentRow()],
      })],
    });

    const result = mapVideoRow(row);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].comments).toHaveLength(1);
    expect(result.versions[0].comments[0].id).toBe('comment-1');
    expect(result.versions[0].comments[0].text).toBe('Great shot!');
  });

  it('should nest annotations under their parent comment', () => {
    const annotationRow = makeAnnotationRow({ comment_id: 'comment-1' });
    const commentRow = makeCommentRow({
      id: 'comment-1',
      annotations: [annotationRow],
    });
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [commentRow],
      })],
    });

    const result = mapVideoRow(row);
    const comment = result.versions[0].comments[0];

    expect(comment.annotations).toHaveLength(1);
    expect(comment.annotations[0].id).toBe('ann-1');
    expect(comment.annotations[0].commentId).toBe('comment-1');
    expect(comment.annotations[0].type).toBe('pen');
    expect(comment.annotations[0].timecode).toBe(5.0);
  });

  it('should handle comments with no annotations', () => {
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [makeCommentRow({ annotations: [] })],
      })],
    });

    const result = mapVideoRow(row);
    expect(result.versions[0].comments[0].annotations).toEqual([]);
  });

  it('should handle comments with multiple annotations', () => {
    const ann1 = makeAnnotationRow({ id: 'ann-1', type: 'pen' });
    const ann2 = makeAnnotationRow({ id: 'ann-2', type: 'text' });
    const commentRow = makeCommentRow({
      annotations: [ann1, ann2],
    });
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [commentRow],
      })],
    });

    const result = mapVideoRow(row);
    expect(result.versions[0].comments[0].annotations).toHaveLength(2);
  });

  it('should handle multiple comments each with annotations', () => {
    const comment1 = makeCommentRow({
      id: 'c1',
      annotations: [makeAnnotationRow({ id: 'a1', comment_id: 'c1' })],
    });
    const comment2 = makeCommentRow({
      id: 'c2',
      timecode: 10,
      annotations: [
        makeAnnotationRow({ id: 'a2', comment_id: 'c2' }),
        makeAnnotationRow({ id: 'a3', comment_id: 'c2' }),
      ],
    });
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [comment1, comment2],
      })],
    });

    const result = mapVideoRow(row);
    expect(result.versions[0].comments[0].annotations).toHaveLength(1);
    expect(result.versions[0].comments[1].annotations).toHaveLength(2);
  });

  it('should handle null/undefined versions gracefully', () => {
    const row = makeDbRow({ versions: null });
    const result = mapVideoRow(row);
    expect(result.versions).toEqual([]);
  });

  it('should handle null/undefined comments gracefully', () => {
    const row = makeDbRow({
      versions: [makeVersionRow({ comments: null })],
    });
    const result = mapVideoRow(row);
    expect(result.versions[0].comments).toEqual([]);
  });

  it('should handle null/undefined annotations on comment gracefully', () => {
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [makeCommentRow({ annotations: null })],
      })],
    });
    const result = mapVideoRow(row);
    expect(result.versions[0].comments[0].annotations).toEqual([]);
  });

  it('should not have annotations at version level', () => {
    const row = makeDbRow({
      versions: [makeVersionRow({
        comments: [makeCommentRow()],
      })],
    });
    const result = mapVideoRow(row);
    // Version should not have an 'annotations' property
    expect((result.versions[0] as any).annotations).toBeUndefined();
  });
});
