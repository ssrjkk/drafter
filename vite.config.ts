import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => ({
  // Overridable so the same build works for root-served deploys (Docker, self-host)
  // and for GitHub Pages project sites, which are served from /<repo>/.
  base: process.env.VITE_BASE ?? '/',
  // Default 'localhost' resolves to the IPv6 loopback on Node 17+, which is
  // unreachable where IPv6 is disabled or firewalled (common on Windows).
  // Playwright polls http://localhost:5173, so bind the IPv4 loopback explicitly.
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  plugins: [
    react(),
    ...(mode === 'analyze' ? [visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })] : []),
    {
      name: 'dev-telemetry-mock',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/api/telemetry', (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end('{}');
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'workers/[name]-[hash].js',
      },
    },
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    clean: true,
    esbuild: {
      drop: ['debugger', 'console'],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'ui-vendor': ['react', 'react-dom'],
          'db-vendor': ['sql.js'],
          'state-vendor': ['zustand', 'immer'],
          'utils-vendor': ['jspdf'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false,
  },
}))
