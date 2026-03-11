import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/lib/**/*.ts'],
            reporter: ['text', 'lcov'],
        },
    },
});
