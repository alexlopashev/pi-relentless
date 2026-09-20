import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
export default defineConfig(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", ".harness/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "scripts/prepare-package.mjs",
            "scripts/prepare-install.mjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
