// Design screenshots only (not part of the test run): see
// .github/workflows/design-shots.yml. Reuses the normal test server.
import base from './playwright.config.js';
export default { ...base, testMatch: ['design-shots.spec.js'], retries: 0, fullyParallel: false, workers: 1 };
