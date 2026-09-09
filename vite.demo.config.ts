import { defineConfig } from 'vite';

export default defineConfig({ root: 'demo', publicDir: '../public', build: { outDir: '../demo-dist', emptyOutDir: true } });
