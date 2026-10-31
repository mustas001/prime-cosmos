import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The brute-force cross-checks (tens of thousands of lattice sites) are quick on an idle
    // machine but can exceed the 5 s default when the CPU is busy.
    testTimeout: 30_000,
  },
});
