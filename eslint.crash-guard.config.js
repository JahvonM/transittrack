// Runs before every build (see package.json "build"). Only checks the React
// hook rules: breaking them doesn't fail the build on its own but blanks the
// screen at runtime, which is exactly how the Admin page crashed once.
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
