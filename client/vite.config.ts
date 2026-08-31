import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_API_PROXY ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // 開發時把 /api 轉給後端, 前端不必處理 CORS
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
