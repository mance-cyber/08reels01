'use client';
import React, { useEffect, useMemo, createContext, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from '@/components/ui/sidebar';
import Link from 'next/link';
import { Film, LogOut, Home, Shield, Search } from 'lucide-react';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/supabase';
import type { Video } from '@/lib/types';

interface AppLayoutContextType {
  videos: Video[] | null;
  setVideos: React.Dispatch<React.SetStateAction<Video[] | null>>;
  loading: boolean;
}

export const AppLayoutContext = createContext<AppLayoutContextType>({
  videos: null,
  setVideos: () => {},
  loading: true,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const videosQuery = useMemo(() => {
    if (!isAuthenticated) return null;
    return { table: 'videos', orderBy: { column: 'uploaded_at', ascending: false }, enabled: true };
  }, [isAuthenticated]);

  const { data: initialVideos, loading: videosLoading, error } = useCollection<Video>(videosQuery);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  useEffect(() => {
    if (initialVideos) {
      setVideos(initialVideos);
    }
  }, [initialVideos]);

  // Clear videos state on logout
  useEffect(() => {
    if (!isAuthenticated) {
      setVideos(null);
      setSidebarSearch('');
    }
  }, [isAuthenticated]);
  
  const filteredVideos = useMemo(() => {
    if (!videos || !user) return [];
    const searchLower = sidebarSearch.toLowerCase().trim();
    const roleFiltered = user.role === 'admin'
      ? videos.filter(v => !v.isDeleted)
      : videos.filter(v => {
          if (v.isDeleted) return false;
          const isAuthor = v.author.id === user.id;
          const isAssigned = v.assignedUserIds?.includes(user.id);
          const isPublic = !v.assignedUserIds || v.assignedUserIds.length === 0;
          return isAuthor || isAssigned || isPublic;
        });
    if (!searchLower) return roleFiltered;
    return roleFiltered.filter(v => v.title.toLowerCase().includes(searchLower));
  }, [videos, user, sidebarSearch]);
  

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🎬 Videos loading:', videosLoading);
      console.log('🎬 Initial Videos data:', initialVideos);
      console.log('🎬 Filtered videos data:', filteredVideos);
      console.log('🎬 Videos error:', error);
      console.log('🎬 Supabase: Connected');
      console.log('🎬 Authenticated:', isAuthenticated);
      console.log('👤 Current user:', user);
    }
  }, [initialVideos, filteredVideos, videosLoading, error, isAuthenticated, user]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=${pathname}`);
    }
  }, [authLoading, isAuthenticated, router, pathname]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icons.logo className="h-12 w-12 animate-pulse text-primary" />
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }
  
  return (
    <AppLayoutContext.Provider value={{ videos: filteredVideos, setVideos, loading: videosLoading }}>
      <SidebarProvider>
        <Sidebar side="left" collapsible="icon" className="border-r">
          <SidebarHeader>
            <Link href="/" className="flex items-center justify-center gap-2 p-2 text-primary group-data-[collapsible=icon]:justify-center">
              <Icons.logo className="size-6 shrink-0"/>
              <span className="text-lg font-bold group-data-[collapsible=icon]:hidden">Reels 08</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
              <SidebarMenu>
                  <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="首頁" isActive={pathname === '/'}>
                          <Link href="/">
                              <Home />
                              <span>首頁</span>
                          </Link>
                      </SidebarMenuButton>
                  </SidebarMenuItem>
                  {user?.role === 'admin' && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="後台管理" isActive={pathname === '/admin'}>
                        <Link href="/admin">
                          <Shield />
                          <span>後台管理</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
              </SidebarMenu>
              <SidebarMenu className="mt-4">
                  <p className="px-4 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    專案列表 {filteredVideos && filteredVideos.length > 0 && `(${filteredVideos.length})`}
                  </p>
                  <div className="px-3 pb-2 group-data-[collapsible=icon]:hidden">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="搜尋專案..."
                        value={sidebarSearch}
                        onChange={e => setSidebarSearch(e.target.value)}
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  
                  {videosLoading && !videos && Array.from({ length: 3 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                      <div className="flex items-center gap-2 p-2">
                        <Skeleton className="size-4" />
                        <Skeleton className="h-4 w-24 group-data-[collapsible=icon]:hidden" />
                      </div>
                    </SidebarMenuItem>
                  ))}
                  
                  {error && (
                    <SidebarMenuItem>
                      <div className="px-4 py-2 text-xs text-destructive">
                        載入失敗: {error.message}
                      </div>
                    </SidebarMenuItem>
                  )}
                  
                  {!videosLoading && filteredVideos?.length === 0 && (
                    <SidebarMenuItem>
                      <div className="px-4 py-2 text-xs text-muted-foreground">
                        尚無影片專案
                      </div>
                    </SidebarMenuItem>
                  )}
                  
                  {filteredVideos?.map(video => (
                      <SidebarMenuItem key={video.id}>
                          <SidebarMenuButton asChild tooltip={video.title} isActive={pathname.startsWith(`/videos/${video.id}`)}>
                              <Link href={`/videos/${video.id}`}>
                                  <Film />
                                  <span>{video.title}</span>
                              </Link>
                          </SidebarMenuButton>
                      </SidebarMenuItem>
                  ))}
              </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
               <Button variant="ghost" className="w-full justify-start gap-2 p-2 group-data-[collapsible=icon]:justify-center" onClick={() => logout()}>
                  <LogOut className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">登出</span>
               </Button>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 flex flex-col ml-[3rem] group-data-[state=expanded]/sidebar-wrapper:ml-[16rem] transition-[margin-left] duration-200">
          {children}
        </div>
      </SidebarProvider>
    </AppLayoutContext.Provider>
  );
}
