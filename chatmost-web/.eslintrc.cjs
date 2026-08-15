module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".wrangler", "node_modules"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh", "react-compiler"],
  rules: {
    "react-compiler/react-compiler": "error",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
