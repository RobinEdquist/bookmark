import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import onlyWarn from "eslint-plugin-only-warn";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    rules: {
      // Naming a property purely to keep it out of a rest spread is the point of
      // the pattern, not dead code: `({ fill, ...rest }) => <img {...rest} />`.
      // ESLint's default (`ignoreRestSiblings: false`) reports those names, so
      // every such site needed an `eslint-disable-next-line` — and those
      // comments silently stopped covering the bindings the moment Prettier
      // reflowed the destructure onto several lines, which is exactly what
      // happened when formatting was applied across the repo.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**"],
  },
];
