import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: { index: 'src/index.ts', react: 'src/react.tsx', logo: 'src/logo/standalone.ts' }, formats: ['es'], fileName: (_format, name) => `${name}.js` },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { banner: chunk => chunk.name === 'react' ? "'use client';" : '' },
    },
  },
});
