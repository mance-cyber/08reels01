export type User = {
  id: string; // Supabase Auth UID
  name: string;
  email?: string | null;
  photoURL?: string | null;
  role?: 'admin' | 'employee';
};

export type PenAnnotationData = {
  path: { x: number, y: number }[];
  color: string;
  lineWidth: number;
};

export type ImageAnnotationData = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in radians
};

export type TextAnnotationData = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  backgroundColor?: string; // 背景顏色 (可選)
  rotation: number; // in radians
};

export type Annotation = {
    id: string;
    commentId: string;
    type: 'pen' | 'image' | 'text';
    data: PenAnnotationData | ImageAnnotationData | TextAnnotationData;
    author: Pick<User, 'id' | 'name'>;
    createdAt: string;
    timecode: number;
}

export type Comment = {
  id: string;
  timecode: number;
  timecodeFormatted: string;
  text: string;
  author: Pick<User, 'id' | 'name'>;
  createdAt: string;
  annotations: Annotation[];
};

export type VersionStatus = 'pending_review' | 'needs_changes' | 'approved' | 'rejected';

export interface QualityOption {
  label: string; // e.g., "1080p", "720p"
  url: string;
}

export type Version = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  createdAt: string;
  uploader: Pick<User, 'id' | 'name'>;
  comments: Comment[];
  isCurrentActive: boolean;
  videoUrl: string;
  qualities?: QualityOption[];
  notes?: string;
  thumbnailUrl?: string;
};

export type Video = {
  id: string;
  title: string;
  thumbnailUrl: string;
  thumbnailHint: string;
  author: Pick<User, 'id' | 'name'>;
  uploadedAt: string;
  versions: Version[];
  videoUrl: string; // The URL of the currently active video version for quick access
  assignedUserIds: string[];
  isDeleted?: boolean;
  deletedAt?: string;
};
