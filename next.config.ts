import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ahglddhcfbbxrhmdqvrz.supabase.co',
        port: '',
        pathname: '/storage/**',
      },
    ],
  },
  // 注意: COEP/COOP 標頭會阻止 Firebase Storage 資源載入
  // FFmpeg.wasm 在沒有 SharedArrayBuffer 的情況下仍可運作（但較慢）
  // 如果需要完整的 FFmpeg 性能，請考慮使用伺服器端處理
  // async headers() {
  //   return [
  //     {
  //       source: '/:path*',
  //       headers: [
  //         {
  //           key: 'Cross-Origin-Embedder-Policy',
  //           value: 'require-corp',
  //         },
  //         {
  //           key: 'Cross-Origin-Opener-Policy',
  //           value: 'same-origin',
  //         },
  //       ],
  //     },
  //   ];
  // },
};

export default nextConfig;
