import { defineConfig } from "cypress";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild";

// The demo app's password lives in a local .env file (created by `npm run setup`, never
// committed). In CI the same file is generated with a random password.
try {
  process.loadEnvFile();
} catch {
  // no .env file: KATA_PASSWORD (or CYPRESS_password) must come from the environment
}

export default defineConfig({
  e2e: {
    // The app under test: start it with `npm run start:test` (or let `npm run e2e` do it).
    baseUrl: "http://localhost:3000",
    // Cucumber: Cypress runs .feature files instead of .cy.ts specs.
    specPattern: "cypress/e2e/**/*.feature",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: true,
    // No automatic retries: a flaky test should fail loudly, not pass on the second try.
    retries: { runMode: 0, openMode: 0 },
    // Secrets (Cypress 16): read in tests with cy.env(["password"]). Value from KATA_PASSWORD;
    // the CYPRESS_password environment variable overrides it.
    env: {
      password: process.env.KATA_PASSWORD ?? "",
    },
    async setupNodeEvents(on, config) {
      // 1. Registers the Cucumber plugin (tag filtering, reports).
      await addCucumberPreprocessorPlugin(on, config);
      // 2. Bundles .feature files + TypeScript step definitions with esbuild.
      on("file:preprocessor", createBundler({ plugins: [createEsbuildPlugin(config)] }));
      // 3. Cypress needs the (possibly modified) config back.
      return config;
    },
  },
});
