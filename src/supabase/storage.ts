'use client';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Verifies if a video URL supports Range requests.
 */
export async function verifyRangeSupport(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'Range': 'bytes=0-0' },
    });

    const acceptRanges = response.headers.get('Accept-Ranges');
    const contentType = response.headers.get('Content-Type');

    const supportsRange = (
      (response.status === 206 || acceptRanges === 'bytes') &&
      (contentType?.startsWith('video/') ?? false)
    );

    return supportsRange;
  } catch (error) {
    console.error('Range Support check failed:', error);
    return false;
  }
}

/**
 * Calculates average brightness (luminance) of canvas pixel data.
 * Uses the standard luminance formula: 0.299R + 0.587G + 0.114B.
 */
function calculateBrightness(context: CanvasRenderingContext2D, width: number, height: number): number {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let totalLuminance = 0;
  const pixelCount = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    totalLuminance += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  return totalLuminance / pixelCount;
}

/**
 * Generates a thumbnail from a video file.
 *
 * Captures frames at 25%, 50%, and 75% of the video duration and
 * selects the brightest one to avoid dark or transitional frames.
 * Times out after 10 seconds to prevent hanging on corrupted videos.
 */
export async function generateVideoThumbnail(
  videoFile: File,
  maxWidth: number = 640
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return reject(new Error('Failed to get canvas context.'));
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Thumbnail generation timed out after 10 seconds'));
    }, 10_000);

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
    };

    const candidatePositions = [0.25, 0.50, 0.75];
    const candidates: Array<{ brightness: number; blob: Blob }> = [];
    let currentIndex = 0;

    const captureFrame = (): { brightness: number } => {
      const aspectRatio = video.videoWidth / video.videoHeight;
      canvas.width = Math.min(maxWidth, video.videoWidth);
      canvas.height = canvas.width / aspectRatio;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const brightness = calculateBrightness(context, canvas.width, canvas.height);
      return { brightness };
    };

    const seekToNext = () => {
      if (currentIndex < candidatePositions.length) {
        video.currentTime = video.duration * candidatePositions[currentIndex];
      }
    };

    video.onloadedmetadata = () => {
      seekToNext();
    };

    video.onseeked = () => {
      const { brightness } = captureFrame();

      canvas.toBlob(
        (blob) => {
          if (blob) {
            candidates.push({ brightness, blob });
          }

          currentIndex += 1;

          if (currentIndex < candidatePositions.length) {
            seekToNext();
          } else {
            // All candidates captured — pick the brightest
            if (candidates.length === 0) {
              cleanup();
              reject(new Error('Failed to create thumbnail blob.'));
              return;
            }

            const best = candidates.reduce((a, b) => (b.brightness > a.brightness ? b : a));
            cleanup();
            resolve(best.blob);
          }
        },
        'image/jpeg',
        0.85
      );
    };

    video.onerror = (e) => {
      let errorMsg = 'An unknown error occurred while loading the video.';
      if (typeof e === 'string') {
        errorMsg = e;
      } else if (e instanceof Event && video.error) {
        switch (video.error.code) {
          case video.error.MEDIA_ERR_ABORTED:
            errorMsg = 'The video loading was aborted.';
            break;
          case video.error.MEDIA_ERR_NETWORK:
            errorMsg = 'A network error caused the video to fail to load.';
            break;
          case video.error.MEDIA_ERR_DECODE:
            errorMsg = 'The video could not be decoded.';
            break;
          case video.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = 'The video source format is not supported.';
            break;
          default:
            errorMsg = 'An error occurred while handling the video.';
        }
      }
      cleanup();
      reject(new Error(errorMsg));
    };

    video.src = URL.createObjectURL(videoFile);
    video.load();
  });
}

/**
 * Uploads a thumbnail blob to Supabase Storage.
 */
export async function uploadThumbnail(
  supabase: SupabaseClient,
  thumbnailBlob: Blob,
  videoId: string,
  versionNumber?: number,
): Promise<string> {
  const thumbnailPath = versionNumber
    ? `${videoId}/versions/v${versionNumber.toString().padStart(2, '0')}_thumbnail.jpg`
    : `${videoId}/thumbnail.jpg`;

  const { error } = await supabase.storage
    .from('videos')
    .upload(thumbnailPath, thumbnailBlob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
      upsert: true,
    });

  if (error) {
    console.error('uploadThumbnail failed:', error);
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(thumbnailPath);

  return publicUrl;
}

/**
 * Uploads a video file to Supabase Storage and returns the download URL.
 * Also generates and uploads a thumbnail.
 */
export async function uploadVideoAndGetUrl(
  supabase: SupabaseClient,
  file: File,
  onProgress: (progress: number) => void,
  videoId?: string,
  versionNumber?: number,
): Promise<{ videoUrl: string; videoId: string; thumbnailUrl: string }> {
  const videoProjectId = videoId || uuidv4();

  let thumbnailUrl = `https://placehold.co/600x400/208279/FFFFFF/png?text=Video`;
  try {
    const thumbnailBlob = await generateVideoThumbnail(file);
    const thumbUrl = await uploadThumbnail(supabase, thumbnailBlob, videoProjectId, versionNumber);
    if (!versionNumber || versionNumber === 1) {
      thumbnailUrl = thumbUrl;
    }
  } catch (error) {
    console.error('Thumbnail generation failed, using fallback.', error);
  }

  const versionIdForPath = versionNumber ? `v${versionNumber.toString().padStart(2, '0')}` : 'v01';
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${videoProjectId}/versions/${versionIdForPath}/${cleanFileName}`;

  const getVideoContentType = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: { [key: string]: string } = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'm4v': 'video/x-m4v',
    };
    return mimeTypes[ext || ''] || file.type || 'video/mp4';
  };

  // Use XMLHttpRequest for real upload progress tracking
  onProgress(0);

  const contentType = getVideoContentType(file.name);

  // Extract Supabase URL and auth token from the client
  const supabaseUrl = (supabase as any).supabaseUrl as string;
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  // Prefer session token, fall back to the anon key embedded in the client
  const authToken = accessToken || (supabase as any).supabaseKey as string;

  if (!supabaseUrl || !authToken) {
    throw new Error('Unable to resolve Supabase URL or auth token for upload.');
  }

  const uploadEndpoint = `${supabaseUrl}/storage/v1/object/videos/${storagePath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed due to a network error.'));
    xhr.onabort = () => reject(new Error('Upload was aborted.'));

    xhr.open('POST', uploadEndpoint, true);
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Cache-Control', 'public, max-age=31536000');
    xhr.send(file);
  });

  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(storagePath);

  return { videoUrl: publicUrl, videoId: videoProjectId, thumbnailUrl };
}

/**
 * Uploads an image for an annotation to Supabase Storage.
 */
export async function uploadAnnotationImage(
  supabase: SupabaseClient,
  file: File,
  videoId: string,
  versionId: string,
): Promise<string> {
  const annotationImageId = uuidv4();
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${videoId}/versions/${versionId}/annotations/${annotationImageId}-${cleanFileName}`;

  const { error } = await supabase.storage
    .from('videos')
    .upload(storagePath, file, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000',
    });

  if (error) {
    console.error('Annotation image upload failed:', error);
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(storagePath);

  return publicUrl;
}
