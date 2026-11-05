// API steps with cy.request(). failOnStatusCode: false lets negative tests
// assert on 4xx responses instead of Cypress failing the request itself.

import { Given, Then, When } from "@badeball/cypress-cucumber-preprocessor";
import { ApiError, DEFAULT_PAYMENT, NewPayment } from "../types";

function postPayment(overrides: Partial<NewPayment>, headers: Record<string, string> = {}): void {
  cy.get<string>("@token").then((token) => {
    cy.request({
      method: "POST",
      url: "/api/payments",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: { ...DEFAULT_PAYMENT, ...overrides },
      failOnStatusCode: false,
    }).as("response");
  });
}

// --- Auth ------------------------------------------------------------------------

Given("I have an API token for {string}", (username: string) => {
  cy.apiToken(username).as("token");
});

Given("I have no API token", () => {
  cy.wrap("").as("token");
});

// --- Requests ----------------------------------------------------------------------

When("I POST a payment of {string} {word}", (amount: string, currency: string) => {
  postPayment({ amount, currency });
});

When(
  "I POST a payment of {string} {word} with Idempotency-Key {string}",
  (amount: string, currency: string, key: string) => {
    postPayment({ amount, currency }, { "Idempotency-Key": key });
  },
);

When("I POST a payment with debtor IBAN {string}", (debtorIban: string) => {
  postPayment({ debtorIban });
});

When("{string} approves it through the API", (checker: string) => {
  cy.get<string>("@paymentId").then((id) => {
    cy.apiToken(checker).then((token) => {
      cy.request({
        method: "POST",
        url: `/api/payments/${id}/approve`,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      }).as("response");
    });
  });
});

// --- Assertions --------------------------------------------------------------------

Then("the response status is {int}", (status: number) => {
  cy.get<Cypress.Response<unknown>>("@response").its("status").should("eq", status);
});

Then("the response header {string} is {string}", (name: string, value: string) => {
  // Header names arrive in lower case.
  cy.get<Cypress.Response<unknown>>("@response").its("headers").its(name.toLowerCase()).should("eq", value);
});

Then("the response field {string} is {string}", (field: string, value: string) => {
  cy.get<Cypress.Response<Record<string, unknown>>>("@response").its("body").its(field).should("eq", value);
});

Then(
  "the error is {string} on field {string} with message {string}",
  (code: string, field: string, message: string) => {
    cy.get<Cypress.Response<ApiError>>("@response")
      .its("body.error")
      .should("deep.equal", { code, field, message });
  },
);

Then("the error code is {string}", (code: string) => {
  cy.get<Cypress.Response<ApiError>>("@response").its("body.error.code").should("eq", code);
});

Then("there is/are {int} payment(s)", (count: number) => {
  cy.get<string>("@token").then((token) => {
    cy.request({ url: "/api/payments", headers: { Authorization: `Bearer ${token}` } })
      .its("body")
      .should("have.length", count);
  });
});
