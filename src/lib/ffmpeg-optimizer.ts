'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

export interface FFmpegOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  videoBitrate?: string; // e.g., '2M' for 2 Mbps
  audioBitrate?: string; // e.g., '128k'
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  crf?: number; // 0-51, lower = better quality, 23 is default
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

const DEFAULT_OPTIONS: Required<FFmpegOptimizationOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  videoBitrate: '2.5M',
  audioBitrate: '128k',
  preset: 'fast',
  crf: 23,
  onProgress: () => {},
  onLog: () => {},
};

/**
 * 載入 FFmpeg WebAssembly
 */
export async function loadFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpeg && isLoaded) {
    return ffmpeg;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async (): Promise<FFmpeg> => {
    try {
      ffmpeg = new FFmpeg();

      if (onLog) {
        ffmpeg.on('log', ({ message }) => {
          onLog(message);
        });
      }

      // 載入 FFmpeg core - 使用 unpkg CDN
      // 注意:版本號應該與 @ffmpeg/ffmpeg 套件相容
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      } catch (loadError) {
        // 如果 CDN 載入失敗,嘗試使用備用 CDN
        console.warn('主要 CDN 載入失敗,嘗試備用 CDN...', loadError);
        const altBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

        await ffmpeg.load({
          coreURL: await toBlobURL(`${altBaseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${altBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      isLoaded = true;
      return ffmpeg;
    } catch (error) {
      console.error('FFmpeg 載入失敗:', error);
      isLoaded = false;
      ffmpeg = null;
      loadingPromise = null;

      // 提供更詳細的錯誤訊息
      if (error instanceof Error) {
        if (error.message.includes('SharedArrayBuffer')) {
          throw new Error('瀏覽器不支援 SharedArrayBuffer。請確保使用 HTTPS 並且瀏覽器支援此功能。');
        }
        throw new Error(`FFmpeg 載入失敗: ${error.message}`);
      }
      throw new Error('無法載入 FFmpeg,請重新整理頁面後再試');
    }
  })();

  return loadingPromise;
}

/**
 * 檢查 FFmpeg 是否已載入
 */
export function isFFmpegLoaded(): boolean {
  return isLoaded && ffmpeg !== null;
}

/**
 * 使用 FFmpeg 優化影片
 * - 轉換為 MP4 (H.264) 格式
 * - 加入 faststart 標記以支援串流播放
 * - 可選擇性調整解析度和位元率
 */
export async function optimizeVideoWithFFmpeg(
  file: File,
  options: FFmpegOptimizationOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const ff = await loadFFmpeg(opts.onLog);

  const inputName = 'input' + getFileExtension(file.name);
  const outputName = 'output.mp4';

  try {
    opts.onProgress(5);
    opts.onLog?.('正在載入影片檔案...');

    // 將檔案寫入 FFmpeg 虛擬檔案系統
    await ff.writeFile(inputName, await fetchFile(file));

    opts.onProgress(10);
    opts.onLog?.('正在分析影片...');

    // 取得影片資訊
    const videoInfo = await getVideoInfo(ff, inputName);

    // 計算輸出尺寸
    let scaleFilter = '';
    if (videoInfo.width > opts.maxWidth || videoInfo.height > opts.maxHeight) {
      // 計算縮放比例,保持長寬比
      const scaleRatio = Math.min(
        opts.maxWidth / videoInfo.width,
        opts.maxHeight / videoInfo.height
      );
      const newWidth = Math.round(videoInfo.width * scaleRatio / 2) * 2; // 確保是偶數
      const newHeight = Math.round(videoInfo.height * scaleRatio / 2) * 2;
      scaleFilter = `-vf scale=${newWidth}:${newHeight}`;
      opts.onLog?.(`調整解析度: ${videoInfo.width}x${videoInfo.height} -> ${newWidth}x${newHeight}`);
    }

    opts.onProgress(15);
    opts.onLog?.('開始轉換影片...');

    // 監聽進度
    ff.on('progress', ({ progress }) => {
      // progress 是 0-1 之間的值
      const percent = 15 + Math.round(progress * 80); // 15-95%
      opts.onProgress(Math.min(percent, 95));
    });

    // 建構 FFmpeg 命令
    const args = [
      '-i', inputName,
      '-c:v', 'libx264',       // H.264 編碼
      '-preset', opts.preset,   // 編碼速度
      '-crf', opts.crf.toString(), // 品質
      '-c:a', 'aac',           // AAC 音訊
      '-b:a', opts.audioBitrate, // 音訊位元率
      '-movflags', '+faststart', // 關鍵:將 moov atom 移到檔案開頭
      '-pix_fmt', 'yuv420p',   // 相容性最佳的像素格式
    ];

    // 如果需要縮放,加入濾鏡
    if (scaleFilter) {
      args.push('-vf', scaleFilter.replace('-vf ', ''));
    }

    // 如果設定了位元率限制
    if (opts.videoBitrate) {
      args.push('-b:v', opts.videoBitrate);
      args.push('-maxrate', opts.videoBitrate);
      args.push('-bufsize', opts.videoBitrate.replace(/[^0-9.]/g, '') + 'M');
    }

    args.push(outputName);

    // 執行轉換
    await ff.exec(args);

    opts.onProgress(95);
    opts.onLog?.('正在完成...');

    // 讀取輸出檔案
    const data = await ff.readFile(outputName);

    // 清理虛擬檔案系統
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    opts.onProgress(100);
    opts.onLog?.('轉換完成!');

    return new Blob([data], { type: 'video/mp4' });

  } catch (error) {
    console.error('FFmpeg 轉換錯誤:', error);

    // 嘗試清理
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);
    } catch {}

    throw new Error('影片轉換失敗,請嘗試使用較小的檔案或不同格式');
  }
}

/**
 * 取得影片資訊
 */
async function getVideoInfo(ff: FFmpeg, inputName: string): Promise<{
  width: number;
  height: number;
  duration: number;
}> {
  // 預設值
  let width = 1920;
  let height = 1080;
  let duration = 0;

  // 使用 ffprobe 風格的方式取得資訊
  // 注意:FFmpeg.wasm 的 log 輸出包含影片資訊
  const logs: string[] = [];

  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
  };

  ff.on('log', logHandler);

  try {
    // 執行一個快速的分析命令
    await ff.exec(['-i', inputName, '-f', 'null', '-t', '0.1', '-']);
  } catch {
    // 預期會失敗,但 log 中包含資訊
  }

  // 從 log 中解析影片資訊
  const logText = logs.join('\n');

  // 解析解析度
  const sizeMatch = logText.match(/(\d{2,4})x(\d{2,4})/);
  if (sizeMatch) {
    width = parseInt(sizeMatch[1]);
    height = parseInt(sizeMatch[2]);
  }

  // 解析時長
  const durationMatch = logText.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
  if (durationMatch) {
    duration = parseInt(durationMatch[1]) * 3600 +
               parseInt(durationMatch[2]) * 60 +
               parseInt(durationMatch[3]);
  }

  return { width, height, duration };
}

/**
 * 取得檔案副檔名
 */
function getFileExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '.mp4';
}

/**
 * 預載 FFmpeg (在背景載入以加速首次使用)
 */
export function preloadFFmpeg(): void {
  if (!isLoaded && !loadingPromise) {
    loadFFmpeg().catch(console.error);
  }
}
