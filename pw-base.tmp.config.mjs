import base from '/app/playwright.config.js';
export default { ...base, testDir: '/app/e2e', use: { ...base.use, baseURL: 'http://localhost:4174' } };
