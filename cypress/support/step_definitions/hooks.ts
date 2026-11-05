import { Before } from "@badeball/cypress-cucumber-preprocessor";

// Runs before every scenario (before the Background too): start from an empty payment list.
// Each scenario creates the data it needs, so scenarios never depend on each other.
Before(() => {
  cy.request("POST", "/api/test/reset").its("status").should("eq", 204);
});
