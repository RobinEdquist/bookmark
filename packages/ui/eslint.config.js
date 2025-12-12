import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // cmdk uses custom HTML attributes (without data- prefix) for internal styling selectors
    files: ["**/command.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
];
