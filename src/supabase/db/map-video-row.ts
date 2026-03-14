import type { Video, Version, Comment, Annotation } from '@/lib/types';

/**
 * Maps a raw Supabase database row into the application Video type.
 *
 * Annotations are now nested under comments (not at the version level).
 * Each annotation row includes a comment_id that links it to its parent comment.
 */
export function mapVideoRow(row: any): Video {
  const versions: Version[] = (row.versions || []).map((v: any) => ({
    id: v.id,
    versionNumber: v.version_number,
    status: v.status,
    createdAt: v.created_at,
    uploader: { id: v.uploader_id, name: v.uploader_name },
    comments: (v.comments || []).map((c: any): Comment => ({
      id: c.id,
      timecode: c.timecode,
      timecodeFormatted: c.timecode_formatted,
      text: c.text,
      author: { id: c.author_id, name: c.author_name },
      createdAt: c.created_at,
      annotations: (c.annotations || []).map((a: any): Annotation => ({
        id: a.id,
        commentId: a.comment_id,
        type: a.type,
        data: a.data,
        author: { id: a.author_id, name: a.author_name },
        createdAt: a.created_at,
        timecode: a.timecode,
      })),
    })),
    isCurrentActive: v.is_current_active,
    videoUrl: v.video_url,
    qualities: v.qualities || [],
    notes: v.notes,
    thumbnailUrl: v.thumbnail_url,
  }));

  return {
    id: row.id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    thumbnailHint: row.thumbnail_hint,
    author: { id: row.author_id, name: row.author_name },
    uploadedAt: row.uploaded_at,
    versions,
    videoUrl: row.video_url,
    assignedUserIds: row.assigned_user_ids || [],
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
  };
}
