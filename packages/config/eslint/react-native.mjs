import i18nextPlugin from "eslint-plugin-i18next";
import baseConfig from "./base.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...baseConfig,
  {
    plugins: {
      i18next: i18nextPlugin,
    },
    rules: {
      // React Native specific overrides
      "no-console": process.env.NODE_ENV === "production" ? "error" : "warn",

      // Flag literal strings inside JSX — they must go through t().
      // Attribute values (style props, icon names, etc.) are ignored via
      // the plugin's built-in JSX attribute allow-list.
      "i18next/no-literal-string": [
        "warn",
        {
          // Allow string values inside these JSX attribute names (not text content).
          "jsx-attributes": {
            allow: [
              "testID",
              "accessibilityRole",
              "accessibilityHint",
              "accessibilityLabel",
              "accessible",
              "style",
              "variant",
              "weight",
              "color",
              "size",
              "type",
              "icon",
              "name",
              "id",
              "key",
              "className",
              "placeholder",
              "placeholderTextColor",
              "autoCapitalize",
              "animation",
              "edges",
            ],
          },
          // Allow plain string props on non-JSX (e.g. StyleSheet.create values).
          onlyAttribute: false,
          // Allow strings that are pure formatting (whitespace, punctuation).
          ignoreComponent: ["ThemedCustomText"],
          // Allow i18next key strings themselves.
          ignoreCallee: ["t", "i18next.t", "useTranslation"],
        },
      ],
    },
  },
];

export default config;
