import { defineConfig } from 'vite';

export default defineConfig({ root: 'demo', base: './', publicDir: '../public', build: { outDir: '../demo-dist', emptyOutDir: true } });
