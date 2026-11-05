// cy.intercept() in three roles: stub an error, slow down a real response, replace data.
// Register intercepts BEFORE the page makes the request (these are all "Given" steps
// that come before "I am logged in as ...", which visits the page).

import { Given, Then } from "@badeball/cypress-cucumber-preprocessor";

// Exactly GET /api/payments (not /api/payments/PAY-0001 or .../approve).
const LIST = { method: "GET", pathname: "/api/payments" } as const;

Given("the payments list API fails with status {int}", (statusCode: number) => {
  cy.intercept(LIST, {
    statusCode,
    body: { error: { code: "UNAVAILABLE", message: "Service unavailable" } },
  }).as("listPayments");
});

Given("the payments list API responds after {int} ms", (delayMs: number) => {
  // The request still reaches the real server; only the response is delayed.
  cy.intercept(LIST, (req) => {
    req.on("response", (res) => {
      res.setDelay(delayMs);
    });
  }).as("listPayments");
});

Given("the payments list API returns the fixture {string}", (fixture: string) => {
  cy.intercept(LIST, { fixture }).as("listPayments");
});

Then("I see the loading indicator", () => {
  cy.getByCy("loading").should("be.visible");
});

Then("after the payments list loads I see {string}", (text: string) => {
  cy.wait("@listPayments");
  cy.getByCy("loading").should("not.be.visible");
  cy.getByCy("empty").should("be.visible").and("have.text", text);
});
