import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['security-tests/*.test.js'],environment:'node'}});
