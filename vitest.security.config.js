import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'tt-backend':fileURLToPath(new URL('./src/api/backend.base44.js',import.meta.url))}},
 test:{include:['security-tests/*.test.js'],environment:'node'}
});
