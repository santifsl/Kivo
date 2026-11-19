import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file starts its own pglite database (about 1.3 GB per worker).
    // Run files one at a time so `pnpm test` fits in a 4 GB agent sandbox.
    // Tests inside a file still run in order, as before.
    fileParallelism: false,
  },
});
