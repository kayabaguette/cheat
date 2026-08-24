import { defineConfig } from 'vitest/config';

// Vitest gets its OWN config so it does not load vite.config.ts: the suites here
// test pure logic (the variable tokenizer), so the React plugin and the /api dev
// proxy are dead weight — and loading them made Vitest's newer bundled Vite warn
// about the plugin's deprecated esbuild options on every run.
export default defineConfig({
  test: {
    // Node, not jsdom: no component is rendered, so there is no DOM to emulate
    // (and no extra dependency to pull in).
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
