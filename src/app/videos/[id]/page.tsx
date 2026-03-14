'use client';
import { useParams } from 'next/navigation';
import { useState, useRef, useEffect, useCallback, useMemo, useContext } from 'react';
import Header from '@/components/header';
import VideoPlayer from '@/components/video/player';
import SidePanel from '@/components/video/side-panel';
import type { Video, VersionStatus } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useDoc, useSupabase } from '@/supabase';
import { setVersionStatus, deleteCommentFromVersion } from '@/supabase/db/videos';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayoutContext } from '@/components/app-layout';
import {
  AnnotationCanvas,
  AnnotationToolbar,
  InlineTextEditor,
  useAnnotations,
  useAnnotationInteraction,
  formatTime,
} from '@/components/video/annotations';
import type { CanvasScale } from '@/components/video/annotations/types';
import type { TextAnnotationData, Annotation } from '@/lib/types';

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const supabase = useSupabase();
  const { user } = useAuth();
  const { videos: allVideos, loading: videosLoading } = useContext(AppLayoutContext);

  const videoRef = useMemo(() => {
    if (!videoId) return null;
    return { table: 'videos', id: videoId };
  }, [videoId]);

  const { data: video, loading } = useDoc<Video>(videoRef);

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const playerRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const { toast } = useToast();
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [videoNaturalSize, setVideoNaturalSize] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  // Track container size via ResizeObserver for responsive canvasScale
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize(prev => {
        if (prev && prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const [preloadedUrls, setPreloadedUrls] = useState<Set<string>>(new Set());

  const selectedVersion = video?.versions.find(v => v.id === selectedVersionId);
  const currentThumbnail = selectedVersion?.thumbnailUrl || video?.thumbnailUrl;
  const isAdmin = user?.role === 'admin';

  // Canvas scale calculation
  const canvasScale: CanvasScale = useMemo(() => {
    const displayWidth = containerSize?.width || videoNaturalSize.width;
    const displayHeight = containerSize?.height || videoNaturalSize.height;
    return {
      scaleX: videoNaturalSize.width / displayWidth,
      scaleY: videoNaturalSize.height / displayHeight,
      displayWidth,
      displayHeight,
      canvasWidth: videoNaturalSize.width,
      canvasHeight: videoNaturalSize.height,
    };
  }, [videoNaturalSize, containerSize]);

  // Collect all annotations from all comments in the selected version
  const allAnnotations = useMemo(() => {
    if (!selectedVersion) return [];
    return selectedVersion.comments.flatMap(c => c.annotations);
  }, [selectedVersion]);

  // --- Annotation system ---

  const interactionRef = useRef<{ setSelectedAnnotationId: (id: string | null) => void } | null>(null);

  const handleAnnotationSelect = useCallback((id: string | null) => {
    interactionRef.current?.setSelectedAnnotationId(id);
  }, []);

  const annotations = useAnnotations({
    supabase,
    videoId,
    versionId: selectedVersionId || '',
    commentId: null, // Will be set when entering annotation mode
    existingAnnotations: allAnnotations,
    currentTime,
    canvasScale,
    canvasHeight: videoNaturalSize.height,
    user: user ? { id: user.id, name: user.name } : null,
    isAdmin: isAdmin ?? false,
    onToast: toast,
    onSelectAnnotation: handleAnnotationSelect,
  });

  const interaction = useAnnotationInteraction({
    annotations: annotations.visibleAnnotations,
    annotationMode: annotations.annotationMode,
    penColor: annotations.penColor,
    penLineWidth: annotations.penLineWidth,
    isAnnotating: annotations.isAnnotating && !annotations.isEditingText,
    canvasScale,
    onAddPen: annotations.addPenAnnotation,
    onUpdateAnnotation: annotations.updateAnnotation,
    onEnterTextMode: annotations.enterTextMode,
    onSelectAnnotation: () => {},
    onDoubleClickText: annotations.editExistingText,
  });

  interactionRef.current = interaction;

  // --- Version selection ---
  useEffect(() => {
    if (video && !selectedVersionId) {
      const currentActiveVersion = video.versions.find(v => v.isCurrentActive);
      if (currentActiveVersion) {
        setSelectedVersionId(currentActiveVersion.id);
      } else if (video.versions.length > 0) {
        const latestVersion = video.versions.sort((a, b) => b.versionNumber - a.versionNumber)[0];
        setSelectedVersionId(latestVersion.id);
      }
    }
  }, [video, selectedVersionId]);

  // --- Video metadata ---
  useEffect(() => {
    const videoEl = playerRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      setVideoNaturalSize({ width: videoEl.videoWidth, height: videoEl.videoHeight });
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    if (videoEl.videoWidth > 0) handleLoadedMetadata();
    return () => videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [selectedVersion?.videoUrl]);

  // --- Preloading ---
  useEffect(() => {
    if (!allVideos || allVideos.length < 2 || !videoId) return;
    const idx = allVideos.findIndex(v => v.id === videoId);
    if (idx !== -1 && idx < allVideos.length - 1) {
      const nextVideo = allVideos[idx + 1];
      const nextVersion = nextVideo.versions.find(v => v.isCurrentActive) || nextVideo.versions.sort((a, b) => b.versionNumber - a.versionNumber)[0];
      if (nextVersion) {
        const nextUrl = nextVersion.videoUrl;
        if (!preloadedUrls.has(nextUrl)) {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.href = nextUrl;
          link.as = 'video';
          document.head.appendChild(link);
          setPreloadedUrls(prev => new Set(prev).add(nextUrl));
        }
      }
    }
  }, [allVideos, videoId, preloadedUrls]);

  // --- Time tracking ---
  useEffect(() => {
    const videoEl = playerRef.current;
    if (!videoEl) return;
    const syncTime = () => setCurrentTime(videoEl.currentTime);
    // timeupdate: fires during playback (~4Hz)
    // seeked: fires after user seeks (drag slider, click comment timecode)
    // loadeddata: fires when video loads (sync initial position)
    videoEl.addEventListener('timeupdate', syncTime);
    videoEl.addEventListener('seeked', syncTime);
    videoEl.addEventListener('loadeddata', syncTime);
    // Sync immediately in case video already has a position
    syncTime();
    return () => {
      videoEl.removeEventListener('timeupdate', syncTime);
      videoEl.removeEventListener('seeked', syncTime);
      videoEl.removeEventListener('loadeddata', syncTime);
    };
  }, [playerRef, selectedVersion]);

  // --- Space bar play/pause ---
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    if (playerRef.current.paused) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        event.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  // --- Keyboard shortcuts for annotation mode ---
  useEffect(() => {
    if (!annotations.isAnnotating) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing = target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (annotations.canUndo) {
          e.preventDefault();
          annotations.undo();
        }
        return;
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        if (annotations.canRedo) {
          e.preventDefault();
          annotations.redo();
        }
        return;
      }

      if (isEditing) return;

      // Delete / Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && interaction.selectedAnnotationId) {
        e.preventDefault();
        annotations.deleteAnnotation(interaction.selectedAnnotationId);
        interaction.deselect();
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (annotations.isEditingText) {
          annotations.cancelTextEdit();
        } else if (interaction.selectedAnnotationId) {
          interaction.deselect();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [annotations, interaction]);

  // --- Side panel handlers ---
  const handleAnnotateClick = useCallback((commentId: string, timecode: number) => {
    if (!isAdmin) return;
    if (playerRef.current) {
      playerRef.current.currentTime = timecode;
      playerRef.current.pause();
    }
    // Sync immediately so annotations at this timecode are visible right away
    setCurrentTime(timecode);
    annotations.enterAnnotationMode('select', commentId);
  }, [isAdmin, annotations]);

  const handleTimecodeClick = useCallback((timecode: number) => {
    if (playerRef.current) playerRef.current.currentTime = timecode;
    // Sync immediately — don't wait for seeked event
    setCurrentTime(timecode);
  }, []);

  const handleVersionStatusChange = useCallback((versionId: string, status: VersionStatus) => {
    if (!video || !user) return;
    if (user.role !== 'admin' && user.id !== video.author.id) {
      toast({ variant: 'destructive', title: '權限不足', description: '只有管理員或專案作者才能變更版本狀態。' });
      return;
    }
    setVersionStatus(supabase, video.id, versionId, status);
    toast({ title: '版本狀態已更新' });
  }, [supabase, video, user, toast]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!video || !user || !selectedVersionId) return;
    deleteCommentFromVersion(supabase, video.id, selectedVersionId, commentId);
    toast({ variant: 'default', title: '評論已刪除' });
  }, [supabase, video, user, selectedVersionId, toast]);

  // --- Loading state ---
  if (!video || !selectedVersion) {
    return (
      <>
        <Header title="載入中..." />
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 overflow-hidden">
          <div className="lg:col-span-2 xl:col-span-3 bg-background p-4 h-full max-h-full flex items-center justify-center relative">
            <Skeleton className="w-full aspect-video" />
          </div>
          <div className="lg:col-span-1 xl:col-span-1 h-full overflow-y-auto">
            <div className="p-4 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title={video.title} />
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 overflow-hidden">
        <div className="lg:col-span-2 xl:col-span-3 bg-background p-4 h-full max-h-full flex items-center justify-center">
          <div
            ref={videoContainerRef}
            className="relative w-full max-w-5xl mx-auto"
          >
            <VideoPlayer
              src={selectedVersion.videoUrl}
              poster={currentThumbnail}
              videoRef={playerRef}
              isPaused={annotations.isAnnotating}
              qualities={selectedVersion.qualities}
            />

            {/* Annotation mode banner */}
            {annotations.isAnnotating && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                註解模式已啟用（影片已暫停）
              </div>
            )}

            {/* Main toolbar */}
            {isAdmin && annotations.isAnnotating && (
              <div className="absolute top-4 z-20 flex w-full justify-center">
                <AnnotationToolbar
                  mode={annotations.annotationMode}
                  onModeChange={(mode) => {
                    annotations.setAnnotationMode(mode);
                    if (mode === 'image') {
                      annotations.imageInputRef.current?.click();
                    }
                  }}
                  color={annotations.penColor}
                  onColorChange={annotations.setPenColor}
                  lineWidth={annotations.penLineWidth}
                  onLineWidthChange={annotations.setPenLineWidth}
                  onDone={annotations.done}
                  isUploading={annotations.isUploading}
                  canUndo={annotations.canUndo}
                  canRedo={annotations.canRedo}
                  onUndo={annotations.undo}
                  onRedo={annotations.redo}
                />
              </div>
            )}

            {/* Inline text editor */}
            {annotations.isEditingText && annotations.editingTextPosition && (
              <InlineTextEditor
                canvasPosition={annotations.editingTextPosition}
                scale={canvasScale}
                fontSize={32}
                color={annotations.penColor}
                initialText={
                  annotations.editingAnnotationId
                    ? ((annotations.visibleAnnotations.find(a => a.id === annotations.editingAnnotationId)?.data as TextAnnotationData | undefined)?.text ?? '')
                    : ''
                }
                onComplete={(text) => {
                  if (annotations.editingAnnotationId) {
                    const existing = annotations.visibleAnnotations.find(a => a.id === annotations.editingAnnotationId);
                    if (existing) {
                      const data = { ...existing.data } as TextAnnotationData;
                      annotations.updateAnnotation({ ...existing, data: { ...data, text } });
                    }
                    annotations.cancelTextEdit();
                  } else if (annotations.editingTextPosition) {
                    annotations.addTextAnnotation(
                      text,
                      annotations.editingTextPosition,
                      32,
                      annotations.penColor,
                    );
                  }
                }}
                onCancel={annotations.cancelTextEdit}
              />
            )}

            {/* Canvas */}
            <AnnotationCanvas
              width={videoNaturalSize.width}
              height={videoNaturalSize.height}
              annotations={annotations.visibleAnnotations}
              selectedAnnotationId={interaction.selectedAnnotationId}
              annotationMode={annotations.annotationMode}
              penColor={annotations.penColor}
              penLineWidth={annotations.penLineWidth}
              isAnnotating={annotations.isAnnotating && !annotations.isEditingText}
              currentPath={interaction.currentPath}
              pathTick={interaction.pathTick}
              onMouseDown={interaction.handleMouseDown}
              onMouseMove={interaction.handleMouseMove}
              onMouseUp={interaction.handleMouseUp}
              onDoubleClick={interaction.handleDoubleClick}
            />

            {/* Hidden file input */}
            <input
              type="file"
              ref={annotations.imageInputRef}
              className="hidden"
              accept="image/*"
              onChange={annotations.handleImageFileChange}
            />
          </div>
        </div>

        <div className="lg:col-span-1 xl:col-span-1 h-full overflow-y-auto">
          <SidePanel
            video={video}
            selectedVersion={selectedVersion}
            onVersionChange={setSelectedVersionId}
            onTimecodeClick={handleTimecodeClick}
            onAnnotateClick={handleAnnotateClick}
            currentTimeFormatted={formatTime(currentTime)}
            onDeleteComment={handleDeleteComment}
            onVersionStatusChange={handleVersionStatusChange}
            onNewVersionUploaded={() => {
              toast({ title: '新版本已上傳', description: '資料將在短時間內更新。' });
            }}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </>
  );
}
