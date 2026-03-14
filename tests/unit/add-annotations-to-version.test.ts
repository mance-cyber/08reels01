import { describe, it, expect, vi } from 'vitest';

// Test that addAnnotationsToVersion includes commentId in the DB row
describe('addAnnotationsToVersion', () => {
  it('should include comment_id in the insert row', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    } as any;

    const { addAnnotationsToVersion } = await import('@/supabase/db/videos');

    await addAnnotationsToVersion(
      mockSupabase,
      'video-1',
      'version-1',
      [
        {
          commentId: 'comment-1',
          type: 'pen' as const,
          data: { path: [{ x: 0, y: 0 }], color: '#FF0000', lineWidth: 3 },
          author: { id: 'user-1', name: 'Test' },
          createdAt: '2025-01-01T00:00:00Z',
          timecode: 5.0,
        },
      ],
    );

    expect(mockSupabase.from).toHaveBeenCalledWith('annotations');
    expect(insertMock).toHaveBeenCalledTimes(1);

    const rows = insertMock.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].comment_id).toBe('comment-1');
    expect(rows[0].version_id).toBe('version-1');
    expect(rows[0].type).toBe('pen');
    expect(rows[0].timecode).toBe(5.0);
  });

  it('should throw when supabase insert fails', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    } as any;

    const { addAnnotationsToVersion } = await import('@/supabase/db/videos');

    await expect(
      addAnnotationsToVersion(
        mockSupabase,
        'video-1',
        'version-1',
        [
          {
            commentId: 'comment-1',
            type: 'pen' as const,
            data: { path: [{ x: 0, y: 0 }], color: '#FF0000', lineWidth: 3 },
            author: { id: 'user-1', name: 'Test' },
            createdAt: '2025-01-01T00:00:00Z',
            timecode: 5.0,
          },
        ],
      ),
    ).rejects.toBeDefined();
  });
});
