import base from './playwright.config.js';
export default { ...base, projects: [{ name: 'chromium', use: { ...base.projects[0].use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } }] };
