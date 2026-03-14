'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, GitBranch } from 'lucide-react';
import CommentSection from './comment-section';
import VersionSection from './version-section';
import { Video, Version, VersionStatus, Comment } from '@/lib/types';
import { formatTime } from '@/components/video/annotations/utils';
import { useSupabase } from '@/supabase';
import { addCommentToVersion } from '@/supabase/db/videos';
import { useAuth } from '@/hooks/use-auth';

interface SidePanelProps {
  video: Video;
  selectedVersion: Version;
  onVersionChange: (versionId: string) => void;
  onTimecodeClick: (timecode: number) => void;
  onAnnotateClick: (commentId: string, timecode: number) => void;
  onDeleteComment: (commentId: string) => void;
  onVersionStatusChange: (versionId: string, status: VersionStatus) => void;
  onNewVersionUploaded?: () => void;
  currentTimeFormatted: string;
  isAdmin: boolean;
}

export default function SidePanel({
    video,
    selectedVersion,
    onVersionChange,
    onTimecodeClick,
    onAnnotateClick,
    onDeleteComment,
    onVersionStatusChange,
    onNewVersionUploaded,
    currentTimeFormatted,
    isAdmin,
}: SidePanelProps) {
  const [commentInput, setCommentInput] = useState('');
  const supabase = useSupabase();
  const { user } = useAuth();

  const handleAddComment = (commentText: string) => {
    if (!user || !isAdmin) return;
    const player = document.querySelector('video');
    const currentTime = player ? player.currentTime : 0;

    addCommentToVersion(
      supabase,
      video.id,
      selectedVersion.id,
      {
        text: commentText,
        timecode: currentTime,
        timecodeFormatted: formatTime(currentTime),
      },
      { id: user.id, name: user.name },
    );
  };


  return (
    <div className="h-full bg-card border-l flex flex-col">
      <Tabs defaultValue="comments" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 m-2">
          <TabsTrigger value="comments">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            評論
          </TabsTrigger>
          <TabsTrigger value="versions">
            <GitBranch className="mr-1.5 h-4 w-4" />
            版本
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto">
            <TabsContent value="comments" className="m-0">
                <CommentSection
                    comments={selectedVersion.comments}
                    onCommentClick={onTimecodeClick}
                    currentTimeFormatted={currentTimeFormatted}
                    onAddComment={handleAddComment}
                    inputValue={commentInput}
                    onInputValueChange={setCommentInput}
                    onDeleteComment={onDeleteComment}
                    onAnnotateClick={onAnnotateClick}
                    isAdmin={isAdmin}
                />
            </TabsContent>
            <TabsContent value="versions" className="m-0">
                <VersionSection
                  video={video}
                  versions={video.versions}
                  selectedVersionId={selectedVersion.id}
                  onVersionChange={onVersionChange}
                  onStatusChange={onVersionStatusChange}
                  onNewVersionUploaded={onNewVersionUploaded}
                  onCommentClick={onTimecodeClick}
                />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
