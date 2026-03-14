'use client';
import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { QualitySelector } from './quality-selector';
import { QualityOption } from '@/lib/types';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPaused?: boolean;
  qualities?: QualityOption[];
}

type NetworkSpeed = 'fast' | 'medium' | 'slow' | 'unknown';
type PreloadStrategy = 'auto' | 'metadata' | 'none';

// 格式化時間為 mm:ss 或 hh:mm:ss
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({ src, poster, videoRef, isPaused, qualities }: VideoPlayerProps) {
  // 檢測是否為手機
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const volumeHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercentage, setBufferedPercentage] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [networkSpeed, setNetworkSpeed] = useState<NetworkSpeed>('unknown');
  const [preloadStrategy, setPreloadStrategy] = useState<PreloadStrategy>('metadata');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoMutedMessage, setAutoMutedMessage] = useState(false);
  const wasPlayingBeforeSeek = useRef(false);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekTime = useRef<number | null>(null);
  const bufferingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 檢測網絡速度並設定預載策略
  useEffect(() => {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      const updateNetworkInfo = () => {
        const effectiveType = connection?.effectiveType;
        const downlink = connection?.downlink; // Mbps

        let speed: NetworkSpeed = 'unknown';

        if (downlink >= 5 || effectiveType === '4g') {
          speed = 'fast';
        } else if (downlink >= 1.5 || effectiveType === '3g') {
          speed = 'medium';
        } else {
          speed = 'slow';
        }

        setNetworkSpeed(speed);
        // 根據網速設定預載策略
        // 使用 auto 預載策略以確保有足夠緩衝，避免播放時等待
        if (speed === 'fast') {
          setPreloadStrategy('auto'); // 快速網絡：預載更多數據
        } else if (speed === 'medium') {
          setPreloadStrategy('auto'); // 中等網絡：仍然預載數據
        } else {
          setPreloadStrategy('metadata'); // 慢速網絡：只載入元數據
        }

        console.log(`📶 網絡速度: ${speed} (${downlink?.toFixed(1)} Mbps)`);
      };

      updateNetworkInfo();
      connection.addEventListener('change', updateNetworkInfo);

      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    } else {
      // 沒有網絡連接 API，默認使用 auto 預載策略
      console.log('📶 網絡連接 API 不可用，使用 auto 預載策略');
      setPreloadStrategy('auto');
    }
  }, []);

  // 當外部 src 變化時，更新內部播放源
  useEffect(() => {
    console.log('📹 視頻源更新:', src);
    setCurrentSrc(src);
  }, [src]);

  // 外部暫停控制
  useEffect(() => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      }
    }
  }, [isPaused, videoRef]);

  // 畫質切換邏輯
  const handleQualityChange = (newUrl: string) => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;

      videoRef.current.src = newUrl;
      setCurrentSrc(newUrl);

      videoRef.current.onloadedmetadata = () => {
        videoRef.current!.currentTime = currentTime;
        if (wasPlaying) {
          videoRef.current!.play();
        }
      };
    }
  };

  const togglePlay = async () => {
    console.log('🎬 togglePlay 被調用');

    if (isPaused) {
      console.log('⚠️ isPaused 是 true，直接返回');
      return;
    }

    const video = videoRef.current;
    if (!video) {
      console.error('❌ 視頻元素不存在');
      return;
    }

    if (video.paused) {
      console.log('🚀 直接播放（保持用戶手勢上下文）...');
      console.log('  - readyState:', video.readyState);

      // 關鍵：直接調用 play()，不要在之前有任何 await
      // 這樣可以保持用戶手勢上下文，讓瀏覽器允許有聲音播放
      try {
        await video.play();
        setIsPlaying(true);
        console.log('✅ 播放成功（有聲音）');
      } catch (error) {
        console.error('❌ 播放失敗:', error);
        setIsPlaying(false);

        // 如果有聲音播放失敗，嘗試靜音播放
        // 重新檢查視頻元素是否還存在
        const videoNow = videoRef.current;
        if (!videoNow) {
          console.error('❌ 視頻元素已被移除，無法靜音播放');
          return;
        }

        try {
          console.log('🔇 嘗試靜音後播放...');
          videoNow.muted = true;
          setIsMuted(true);
          await videoNow.play();
          setIsPlaying(true);
          setAutoMutedMessage(true);
          console.log('✅ 靜音播放成功');
          // 5秒後自動隱藏提示
          setTimeout(() => setAutoMutedMessage(false), 5000);
        } catch (muteError) {
          console.error('❌ 靜音播放也失敗:', muteError);
        }
      }
    } else {
      console.log('⏸️ 暫停播放');
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
      // 如果取消靜音，隱藏自動靜音提示
      if (!videoRef.current.muted) {
        setAutoMutedMessage(false);
        // 如果之前音量是0，恢復到合理音量
        if (videoRef.current.volume === 0) {
          videoRef.current.volume = 0.5;
          setVolume(0.5);
        }
      }
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0] / 100;
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
      if (newVolume > 0) {
        setAutoMutedMessage(false);
      }
    }
  };

  const handleVolumeMouseEnter = () => {
    if (volumeHideTimeoutRef.current) {
      clearTimeout(volumeHideTimeoutRef.current);
      volumeHideTimeoutRef.current = null;
    }
    setShowVolumeSlider(true);
  };

  const handleVolumeMouseLeave = () => {
    volumeHideTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 300);
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  
  const handlePointerDown = () => {
    if (videoRef.current) {
      wasPlayingBeforeSeek.current = !videoRef.current.paused;
      if (wasPlayingBeforeSeek.current) {
        videoRef.current.pause();
      }
    }
  };
  
  const handlePointerUp = () => {
    if (videoRef.current && wasPlayingBeforeSeek.current) {
      videoRef.current.play();
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (videoRef.current) {
      const newTime = (value[0] / 100) * duration;
      videoRef.current.currentTime = newTime;
    }
  };
  
  const handleFullScreen = () => {
    if (videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  // 檢查時間點是否在緩衝範圍內
  const isTimeBuffered = (time: number): boolean => {
    const video = videoRef.current;
    if (!video) return false;

    for (let i = 0; i < video.buffered.length; i++) {
      if (time >= video.buffered.start(i) && time <= video.buffered.end(i)) {
        return true;
      }
    }
    return false;
  };

  // 平滑快進/快退的輔助函數
  const smoothSeek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;

    // 計算目標時間
    const targetTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));

    // 如果目標時間在緩衝範圍內,直接跳轉
    if (isTimeBuffered(targetTime)) {
      video.currentTime = targetTime;
      return;
    }

    // 否則使用 debounce 批次處理
    pendingSeekTime.current = targetTime;

    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    seekTimeoutRef.current = setTimeout(() => {
      if (pendingSeekTime.current !== null && video) {
        video.currentTime = pendingSeekTime.current;
        pendingSeekTime.current = null;
      }
    }, 50);
  };

  // 鍵盤控制：左右鍵快進/快退
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // 檢查是否在輸入框中,避免影響表單輸入
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          // 倒退 0.5 秒
          smoothSeek(-0.5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // 前進 0.5 秒
          smoothSeek(0.5);
          break;
        // 空白鍵播放/暫停由 page.tsx 處理
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [videoRef, isPaused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && isFinite(video.duration)) {
        setProgress((video.currentTime / video.duration) * 100);
      } else {
        setProgress(0);
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration && isFinite(video.duration)) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const buffered = (bufferedEnd / video.duration) * 100;
        setBufferedPercentage(buffered);
      }
    };

    const handleWaiting = () => {
      // 延遲顯示緩衝指示器,避免短暫緩衝時閃爍
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
      }
      bufferingTimeoutRef.current = setTimeout(() => {
        console.log('🔄 緩衝中... (readyState:', video.readyState, ')');
        setIsBuffering(true);
        // 暫停播放，等緩衝完成再繼續
        if (!video.paused) {
          console.log('⏸️ 緩衝期間暫停播放');
        }
      }, 300); // 300ms 後才顯示緩衝,短暫的緩衝不會顯示
    };

    const handleCanPlay = () => {
      // 取消緩衝指示器
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      console.log('✅ 可以播放 (readyState:', video.readyState, ')');
      setIsBuffering(false);

      // 如果之前是播放狀態，繼續播放
      if (!video.paused && video.readyState >= 3) {
        console.log('▶️ 繼續播放');
        video.play().catch(err => {
          console.warn('自動繼續播放失敗:', err);
        });
      }
    };

    const handleCanPlayThrough = () => {
      // 取消緩衝指示器
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      console.log('✅ 可以流暢播放');
      setIsBuffering(false);
    };

    const handleSeeked = () => {
      // seek 完成後取消緩衝指示器
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
      setIsBuffering(false);
    };

    const handleStalled = () => {
      console.warn('⚠️ 網路停滯，影片數據載入中斷');
      setIsBuffering(true);
      // 嘗試重新載入當前位置的數據
      if (video.networkState === 2) { // NETWORK_LOADING
        console.log('📡 嘗試繼續載入...');
      }
    };

    const handleError = () => {
      console.error('❌ 視頻加載錯誤:', video.error);
      console.error('   視頻 URL:', video.src);
      console.error('   錯誤代碼:', video.error?.code);
      console.error('   錯誤訊息:', video.error?.message);
      console.error('   NetworkState:', video.networkState);
      console.error('   ReadyState:', video.readyState);

      // 測試影片 URL 是否可訪問
      if (video.src) {
        fetch(video.src, { method: 'HEAD' })
          .then(response => {
            console.log('📡 影片 URL 測試:');
            console.log('   Status:', response.status);
            console.log('   Content-Type:', response.headers.get('Content-Type'));
            console.log('   CORS Headers:', {
              'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
              'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
            });
          })
          .catch(err => {
            console.error('❌ 無法訪問影片 URL:', err);
          });
      }

      setIsBuffering(false);

      let errorMsg = '影片載入失敗';
      let suggestion = '';
      if (video.error) {
        switch (video.error.code) {
          case 1:
            errorMsg = '影片載入被中止';
            suggestion = '請嘗試重新載入';
            break;
          case 2:
            errorMsg = '網路錯誤，無法載入影片';
            suggestion = '請檢查網路連線';
            break;
          case 3:
            errorMsg = '影片解碼失敗（格式不支援）';
            suggestion = '請上傳 MP4 或 WebM 格式的影片';
            break;
          case 4:
            errorMsg = '影片來源不可用或格式不支援';
            suggestion = '可能是 CORS 設定問題，請檢查 Firebase Storage CORS 配置';
            break;
        }
        errorMsg += ` (錯誤碼: ${video.error.code})`;
        if (suggestion) {
          errorMsg += `\n${suggestion}`;
        }
      }
      setErrorMessage(errorMsg);
      console.error('詳細錯誤:', errorMsg);
    };

    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    setIsMuted(video.muted);
    setVolume(video.volume);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);

      // 清除緩衝計時器
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
      }
    };
  }, [videoRef, currentSrc]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden group">
      <video
        ref={videoRef}
        src={currentSrc}
        poster={poster}
        className="w-full h-full object-contain max-h-[85vh]"
        onClick={isMobile ? undefined : togglePlay}
        preload={preloadStrategy}
        playsInline
        crossOrigin="anonymous"
        x-webkit-airplay="allow"
      />
      
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
            <p className="text-white text-sm">加載中...</p>
            {networkSpeed !== 'unknown' && (
              <p className="text-white/70 text-xs">
                網絡: {networkSpeed === 'fast' ? '快速' : networkSpeed === 'medium' ? '中等' : '較慢'}
              </p>
            )}
            <p className="text-white/70 text-xs">
              狀態: {videoRef.current?.readyState || 0} / 網路: {videoRef.current?.networkState || 0}
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="bg-red-500/90 text-white p-4 rounded-lg max-w-md mx-4">
            <p className="font-bold mb-2">播放錯誤</p>
            <p className="text-sm">{errorMessage}</p>
            <button
              onClick={() => {
                setErrorMessage(null);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              className="mt-3 px-4 py-2 bg-white text-red-500 rounded hover:bg-gray-100 text-sm"
            >
              重新載入
            </button>
          </div>
        </div>
      )}
      
      {/* 自動靜音提示 */}
      {autoMutedMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600/95 text-white px-6 py-4 rounded-lg shadow-2xl z-30 max-w-[90%] text-center">
          <div className="font-bold text-lg mb-2">🔇 已自動靜音播放</div>
          <div className="text-sm mb-3">由於瀏覽器限制，視頻已靜音</div>
          <button
            onClick={toggleMute}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 flex items-center gap-2 mx-auto"
          >
            <Volume2 className="w-5 h-5" />
            點此恢復聲音
          </button>
        </div>
      )}
      
      <div className="absolute bottom-0 left-0 right-0 p-2 md:p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="relative w-full h-2 mb-2 group">
           <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-gray-500/30 rounded-full">
                <div 
                    className="absolute top-0 left-0 h-full bg-gray-500/70 rounded-full"
                    style={{ width: `${bufferedPercentage}%` }}
                />
                <Slider
                    value={[progress]}
                    onValueChange={handleProgressChange}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    max={100}
                    step={0.1}
                    className="absolute top-1/2 -translate-y-1/2 w-full cursor-pointer h-1 [&_.slider-thumb]:size-3 [&_.slider-range]:bg-primary"
                />
           </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 md:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="text-white hover:bg-white/20"
              disabled={isPaused || isBuffering}
            >
              {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6" />}
            </Button>
            <div
              ref={volumeContainerRef}
              className="relative flex items-center"
              onMouseEnter={handleVolumeMouseEnter}
              onMouseLeave={handleVolumeMouseLeave}
            >
              <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:bg-white/20">
                <VolumeIcon className="w-5 h-5 md:w-6 md:h-6" />
              </Button>
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80 rounded-lg px-3 py-4 backdrop-blur-sm">
                  <Slider
                    orientation="vertical"
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={handleVolumeChange}
                    max={100}
                    step={1}
                    className="h-24 w-1.5 [&_.slider-thumb]:size-3 [&_.slider-range]:bg-white"
                  />
                </div>
              )}
            </div>
            <span className="text-white text-xs md:text-sm font-mono ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            {qualities && (
              <QualitySelector 
                qualities={qualities}
                currentUrl={currentSrc}
                onQualityChange={handleQualityChange}
              />
            )}
            <select
              className="bg-transparent text-white text-xs md:text-sm border border-white/20 rounded px-1 md:px-2 py-1"
              onChange={(e) => {
                if (videoRef.current) {
                  videoRef.current.playbackRate = parseFloat(e.target.value);
                }
              }}
              defaultValue="1"
            >
              <option value="0.5" className="text-black">0.5x</option>
              <option value="0.75" className="text-black">0.75x</option>
              <option value="1" className="text-black">1x</option>
              <option value="1.25" className="text-black">1.25x</option>
              <option value="1.5" className="text-black">1.5x</option>
              <option value="2" className="text-black">2x</option>
            </select>
            <Button variant="ghost" size="icon" onClick={handleFullScreen} className="text-white hover:bg-white/20">
              <Maximize className="w-5 h-5 md:w-6 md:h-6" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}