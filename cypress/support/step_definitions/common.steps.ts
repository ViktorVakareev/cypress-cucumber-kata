// Steps shared by several features: logging in, test data, banners.

import { Given, Then } from "@badeball/cypress-cucumber-preprocessor";
import { Payment } from "../types";

// --- Session -----------------------------------------------------------------

Given("I am logged in as {string}", (username: string) => {
  cy.loginByApi(username); // cy.session(): real login once, cached afterwards
  cy.visit("/");
  cy.getByCy("payments-view").should("be.visible");
});

// --- Test data through the API (fast, independent of the UI) ----------------

Given(
  "{string} has submitted a payment of {string} {word} with reference {string}",
  (maker: string, amount: string, currency: string, reference: string) => {
    cy.createPayment(maker, { amount, currency, reference }).then((payment: Payment) => {
      // An alias makes the id available to later steps: cy.get("@paymentId").
      cy.wrap(payment.id).as("paymentId");
    });
  },
);

Given("{string} has approved it", (checker: string) => {
  cy.get<string>("@paymentId").then((id) => {
    cy.approveAs(checker, id).its("status").should("not.eq", "Submitted");
  });
});

// --- Messages --------------------------------------------------------------------

Then("I see the error banner {string}", (message: string) => {
  cy.getByCy("error-banner").should("be.visible").and("have.text", message);
});
