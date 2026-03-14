'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '@/supabase';
import type { Video } from '@/lib/types';
import { mapVideoRow } from './map-video-row';

interface UseDocOptions {
  table: string;
  id: string | null;
}

export function useDoc<T>(
  options: UseDocOptions | null
): { data: T | null; loading: boolean; error: Error | null; setData: (data: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = useSupabase();

  const fetchData = useCallback(async (isRefetch = false) => {
    if (!options || !options.id) {
      setData(null);
      setLoading(false);
      return;
    }

    // 只在初次載入時顯示 loading 狀態，即時更新不會觸發整頁刷新
    if (!isRefetch) {
      setLoading(true);
    }

    try {
      if (options.table === 'videos') {
        const { data: row, error: fetchError } = await supabase
          .from('videos')
          .select(`
            *,
            versions (
              *,
              comments (
                *,
                annotations (*)
              )
            )
          `)
          .eq('id', options.id)
          .single();

        if (fetchError) throw fetchError;
        if (row) {
          setData(mapVideoRow(row) as T);
        } else {
          setData(null);
        }
      } else {
        const { data: row, error: fetchError } = await supabase
          .from(options.table)
          .select('*')
          .eq('id', options.id)
          .single();

        if (fetchError) throw fetchError;
        setData(row as T);
      }

      setError(null);
    } catch (err: any) {
      console.error('useDoc error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, options?.table, options?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced refetch for realtime events
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      fetchData(true);
      refetchTimerRef.current = null;
    }, 500);
  }, [fetchData]);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
      }
    };
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!options || !options.id) return;

    const tablesToWatch = options.table === 'videos'
      ? ['videos', 'versions', 'comments', 'annotations']
      : [options.table];

    const channel = supabase
      .channel(`doc-${options.table}-${options.id}-${Date.now()}`);

    for (const table of tablesToWatch) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => {
          debouncedRefetch();
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, options?.table, options?.id, debouncedRefetch]);

  return { data, loading, error, setData };
}
