'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '@/supabase';
import type { Video } from '@/lib/types';
import { mapVideoRow } from './map-video-row';

interface UseCollectionOptions {
  table: string;
  orderBy?: { column: string; ascending?: boolean };
  enabled?: boolean;
}

export function useCollection<T>(
  options: UseCollectionOptions | null
): { data: T[] | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = useSupabase();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const hasInitialLoad = useRef(false);

  const fetchData = useCallback(async (isRefetch = false) => {
    if (!options || options.enabled === false) {
      setData(null);
      setLoading(false);
      return;
    }

    // 只在初次載入時顯示 loading 狀態，即時更新不會觸發整頁刷新
    if (!isRefetch && !hasInitialLoad.current) {
      setLoading(true);
    }

    try {
      if (options.table === 'videos') {
        // Fetch videos with nested versions, comments, and annotations
        let query = supabase
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
          `);

        if (options.orderBy) {
          query = query.order(options.orderBy.column, {
            ascending: options.orderBy.ascending ?? true,
          });
        }

        const { data: rows, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        const mapped = (rows || []).map(mapVideoRow);
        setData(mapped as T[]);
      } else if (options.table === 'users') {
        const { data: rows, error: fetchError } = await supabase
          .from('users')
          .select('*');

        if (fetchError) throw fetchError;

        const mapped = (rows || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          photoURL: row.photo_url,
          role: row.role,
        }));
        setData(mapped as T[]);
      } else {
        const { data: rows, error: fetchError } = await supabase
          .from(options.table)
          .select('*');

        if (fetchError) throw fetchError;
        setData((rows || []) as T[]);
      }

      setError(null);
    } catch (err: any) {
      console.error('useCollection error:', err);
      setError(err);
    } finally {
      setLoading(false);
      hasInitialLoad.current = true;
    }
  }, [supabase, options?.table, options?.orderBy?.column, options?.orderBy?.ascending, options?.enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up Supabase realtime subscription
  useEffect(() => {
    if (!options || options.enabled === false) return;

    const tablesToWatch = options.table === 'videos'
      ? ['videos', 'versions', 'comments', 'annotations']
      : [options.table];

    const channel = supabase
      .channel(`collection-${options.table}-${Date.now()}`)

    for (const table of tablesToWatch) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => {
          // Refetch on any change (background, no loading state)
          fetchData(true);
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, options?.table, options?.enabled, fetchData]);

  return { data, loading, error };
}
