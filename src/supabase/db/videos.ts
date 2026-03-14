'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Video, Comment, VersionStatus, User, Version, Annotation } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export async function setVideo(
  supabase: SupabaseClient,
  videoId: string,
  videoData: Partial<Omit<Video, 'id' | 'versions'>>
) {
  const dbData: Record<string, unknown> = {};
  if (videoData.title !== undefined) dbData.title = videoData.title;
  if (videoData.thumbnailUrl !== undefined) dbData.thumbnail_url = videoData.thumbnailUrl;
  if (videoData.thumbnailHint !== undefined) dbData.thumbnail_hint = videoData.thumbnailHint;
  if (videoData.videoUrl !== undefined) dbData.video_url = videoData.videoUrl;
  if (videoData.assignedUserIds !== undefined) dbData.assigned_user_ids = videoData.assignedUserIds;
  if (videoData.isDeleted !== undefined) dbData.is_deleted = videoData.isDeleted;
  if (videoData.deletedAt !== undefined) dbData.deleted_at = videoData.deletedAt;

  const { error } = await supabase
    .from('videos')
    .update(dbData)
    .eq('id', videoId);

  if (error) {
    console.error('setVideo failed:', error);
    throw error;
  }
}

export async function updateVideoAssignedUsers(
  supabase: SupabaseClient,
  videoId: string,
  assignedUserIds: string[]
) {
  const { error } = await supabase
    .from('videos')
    .update({ assigned_user_ids: assignedUserIds })
    .eq('id', videoId);

  if (error) {
    console.error('updateVideoAssignedUsers failed:', error);
    throw error;
  }
}

async function deleteStorageFolder(
  supabase: SupabaseClient,
  folderPath: string
): Promise<void> {
  const { data: files, error } = await supabase.storage
    .from('videos')
    .list(folderPath, { limit: 1000 });

  if (error) {
    console.error(`Error listing files in ${folderPath}:`, error);
    return;
  }

  if (!files || files.length === 0) return;

  // Separate folders from files
  const folders = files.filter(f => f.id === null || f.metadata === null);
  const fileItems = files.filter(f => f.id !== null && f.metadata !== null);

  // Delete files
  if (fileItems.length > 0) {
    const filePaths = fileItems.map(f => `${folderPath}/${f.name}`);
    const { error: deleteError } = await supabase.storage
      .from('videos')
      .remove(filePaths);
    if (deleteError) {
      console.error(`Error deleting files in ${folderPath}:`, deleteError);
    }
  }

  // Recurse into subfolders
  for (const folder of folders) {
    await deleteStorageFolder(supabase, `${folderPath}/${folder.name}`);
  }
}

export async function deleteVideo(
  supabase: SupabaseClient,
  videoId: string
) {
  // 1. Delete storage files
  try {
    await deleteStorageFolder(supabase, videoId);
  } catch (error) {
    console.error(`Failed to delete storage for video ${videoId}:`, error);
  }

  // 2. Delete from database (cascade will handle versions/comments/annotations)
  const { error } = await supabase
    .from('videos')
    .delete()
    .eq('id', videoId);

  if (error) {
    console.error('deleteVideo failed:', error);
    throw error;
  }
}

export async function addAnnotationsToVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  annotations: Omit<Annotation, 'id'>[],
) {
  const rows = annotations.map(anno => ({
    version_id: versionId,
    comment_id: anno.commentId,
    type: anno.type,
    data: anno.data,
    author_id: anno.author.id,
    author_name: anno.author.name,
    timecode: anno.timecode,
    created_at: anno.createdAt || new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('annotations')
    .insert(rows);

  if (error) {
    console.error('addAnnotationsToVersion failed:', error);
    throw error;
  }
}

export async function updateAnnotationInVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  updatedAnnotation: Annotation,
) {
  const { error } = await supabase
    .from('annotations')
    .update({
      type: updatedAnnotation.type,
      data: updatedAnnotation.data,
      timecode: updatedAnnotation.timecode,
    })
    .eq('id', updatedAnnotation.id);

  if (error) {
    console.error('updateAnnotationInVersion failed:', error);
    throw error;
  }
}

export async function deleteAnnotationFromVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  annotationId: string,
) {
  const { error } = await supabase
    .from('annotations')
    .delete()
    .eq('id', annotationId)
    .eq('version_id', versionId);

  if (error) {
    console.error('deleteAnnotationFromVersion failed:', error);
    throw error;
  }
}

export async function addCommentToVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  commentData: Omit<Comment, 'id' | 'createdAt' | 'author' | 'annotations'>,
  author: Pick<User, 'id' | 'name'>,
) {
  const { error } = await supabase
    .from('comments')
    .insert({
      version_id: versionId,
      timecode: commentData.timecode,
      timecode_formatted: commentData.timecodeFormatted,
      text: commentData.text,
      author_id: author.id,
      author_name: author.name,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('addCommentToVersion failed:', error);
    throw error;
  }
}

export async function deleteCommentFromVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  commentId: string
) {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('deleteCommentFromVersion failed:', error);
    throw error;
  }
}

export async function setVersionStatus(
  supabase: SupabaseClient,
  videoId: string,
  versionId: string,
  status: VersionStatus
) {
  const isNewActiveVersion = status === 'approved';

  if (isNewActiveVersion) {
    // Deactivate all other versions
    await supabase
      .from('versions')
      .update({ is_current_active: false })
      .eq('video_id', videoId);
  }

  // Update the target version
  const { data: updatedVersion, error } = await supabase
    .from('versions')
    .update({
      status,
      is_current_active: isNewActiveVersion,
    })
    .eq('id', versionId)
    .select('video_url')
    .single();

  if (error) {
    console.error('setVersionStatus failed:', error);
    throw error;
  }

  // If approving, update the video's main video_url
  if (isNewActiveVersion && updatedVersion) {
    await supabase
      .from('videos')
      .update({ video_url: updatedVersion.video_url })
      .eq('id', videoId);
  }
}

export async function addVideo(
  supabase: SupabaseClient,
  videoId: string,
  newVideoData: { title: string; videoUrl: string; thumbnailUrl?: string; notes?: string; assignedUserIds?: string[]; },
  author: Pick<User, 'id' | 'name'>
) {
  // Insert video
  const { error: videoError } = await supabase
    .from('videos')
    .insert({
      id: videoId,
      title: newVideoData.title,
      thumbnail_url: newVideoData.thumbnailUrl || 'https://placehold.co/600x400/208279/FFFFFF/png?text=Video',
      thumbnail_hint: 'video thumbnail',
      author_id: author.id,
      author_name: author.name,
      uploaded_at: new Date().toISOString(),
      video_url: newVideoData.videoUrl,
      assigned_user_ids: newVideoData.assignedUserIds || [],
      is_deleted: false,
    });

  if (videoError) {
    console.error('addVideo failed:', videoError);
    throw videoError;
  }

  // Insert first version
  const { error: versionError } = await supabase
    .from('versions')
    .insert({
      video_id: videoId,
      version_number: 1,
      status: 'pending_review',
      created_at: new Date().toISOString(),
      uploader_id: author.id,
      uploader_name: author.name,
      is_current_active: true,
      video_url: newVideoData.videoUrl,
      thumbnail_url: newVideoData.thumbnailUrl,
      notes: newVideoData.notes,
    });

  if (versionError) {
    console.error('addVideo version insert failed:', versionError);
    throw versionError;
  }
}

export async function addNewVersion(
  supabase: SupabaseClient,
  videoId: string,
  versionData: {
    videoUrl: string;
    thumbnailUrl?: string;
    notes?: string;
  },
  uploader: Pick<User, 'id' | 'name'>
): Promise<void> {
  // Get current max version number
  const { data: versions, error: fetchError } = await supabase
    .from('versions')
    .select('version_number')
    .eq('video_id', videoId)
    .order('version_number', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error('addNewVersion fetch failed:', fetchError);
    throw fetchError;
  }

  const maxVersionNumber = versions && versions.length > 0 ? versions[0].version_number : 0;
  const newVersionNumber = maxVersionNumber + 1;

  const { error } = await supabase
    .from('versions')
    .insert({
      video_id: videoId,
      version_number: newVersionNumber,
      status: 'pending_review',
      created_at: new Date().toISOString(),
      uploader_id: uploader.id,
      uploader_name: uploader.name,
      is_current_active: false,
      video_url: versionData.videoUrl,
      thumbnail_url: versionData.thumbnailUrl,
      notes: versionData.notes,
    });

  if (error) {
    console.error('addNewVersion failed:', error);
    throw error;
  }
}
