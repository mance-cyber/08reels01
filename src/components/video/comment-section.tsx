'use client';
import { MessageSquare, Plus, PenLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Comment } from '@/lib/types';
import { useAuth as useAppAuth } from '@/hooks/use-auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from '@/lib/utils';


interface CommentSectionProps {
  comments: Comment[];
  onCommentClick: (timecode: number) => void;
  currentTimeFormatted: string;
  onAddComment: (commentText: string) => void;
  inputValue: string;
  onInputValueChange: (value: string) => void;
  onDeleteComment: (commentId: string) => void;
  onAnnotateClick: (commentId: string, timecode: number) => void;
  isAdmin: boolean;
}

export default function CommentSection({
  comments,
  onCommentClick,
  currentTimeFormatted,
  onAddComment,
  inputValue,
  onInputValueChange,
  onDeleteComment,
  onAnnotateClick,
  isAdmin,
}: CommentSectionProps) {
  const { user } = useAppAuth();

  const handleAddComment = () => {
    if (inputValue.trim() && user) {
      onAddComment(inputValue);
      onInputValueChange('');
    }
  };

  const canDelete = (comment: Comment) => {
    if (!user) return false;
    return user.role === 'admin' || user.id === comment.author.id;
  }

  const handleAnnotateClick = (e: React.MouseEvent, commentId: string, timecode: number) => {
    e.stopPropagation();
    onAnnotateClick(commentId, timecode);
  }

  const hasAnnotations = (comment: Comment) => comment.annotations.length > 0;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>時間軸評論</span>
          <span className="text-sm font-mono text-muted-foreground">{currentTimeFormatted}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
            <div>
            <Textarea
                placeholder="在目前時間點新增評論..."
                className="mb-2"
                value={inputValue}
                onChange={(e) => onInputValueChange(e.target.value)}
            />
            <div className="flex gap-2">
                <Button className="flex-1" onClick={handleAddComment} disabled={!inputValue.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    新增評論
                </Button>
            </div>
            </div>
        )}
        <div className="space-y-4 max-h-[calc(100vh-25rem)] overflow-y-auto pr-2">
          {comments.length > 0 ? (
            comments
              .sort((a,b) => a.timecode - b.timecode)
              .map(comment => (
              <div key={comment.id} className="text-sm group/comment relative">
                <div
                  className="p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted"
                  onClick={() => onCommentClick(comment.timecode)}
                >
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <p className="font-semibold">{comment.author.name}</p>
                        </div>
                        <p className="text-primary font-mono text-xs">{comment.timecodeFormatted}</p>
                    </div>
                  <p className="text-foreground whitespace-pre-wrap">{comment.text}</p>
                </div>
                {isAdmin && (
                    <div className={cn(
                        "absolute top-1 right-1 flex items-center gap-1 rounded-full border bg-background/80 p-1 backdrop-blur-sm",
                        "opacity-0 group-hover/comment:opacity-100 transition-opacity"
                    )}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-6 w-6",
                            hasAnnotations(comment) && "text-primary"
                          )}
                          onClick={(e) => handleAnnotateClick(e, comment.id, comment.timecode)}
                          title="註解"
                        >
                            <PenLine className={cn(
                              "h-3.5 w-3.5",
                              hasAnnotations(comment) && "fill-current"
                            )} />
                        </Button>
                        {canDelete(comment) && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/80 hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                                        <Trash2 className="h-3.5 w-3.5"/>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>確定要刪除這則評論嗎？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            這個操作無法復原。這將會永久刪除此評論。
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>取消</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => onDeleteComment(comment.id)}>確定刪除</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="mx-auto h-12 w-12" />
              <p className="mt-2 text-sm">尚未有任何評論</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
