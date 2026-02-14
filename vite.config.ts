import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/binance': {
          target: 'https://api.binance.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/binance/, '/api')
        },
        '/fapi/binance': {
          target: 'https://fapi.binance.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fapi\/binance/, '/fapi')
        }
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'process.env.VITE_USE_MOCK_API': JSON.stringify(env.VITE_USE_MOCK_API || 'false'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
