// Custom commands: reusable building blocks that read like the domain.
// Step definitions call these; they never repeat request or selector details.

import { DEFAULT_PAYMENT, NewPayment, Payment } from "./types";

// Cypress 16: secrets come from `env` in cypress.config.ts (or CYPRESS_* variables) and are
// read asynchronously with cy.env([...]); public values would use Cypress.expose().
const withPassword = (fn: (password: string) => void): void => {
  cy.env<{ password: string }>(["password"]).then(({ password }) => fn(password));
};

/** cy.getByCy("submit-payment") -> cy.get('[data-cy="submit-payment"]') */
Cypress.Commands.add("getByCy", (name: string) => cy.get(`[data-cy="${name}"]`));

/**
 * Log in through the API and cache the browser session with cy.session().
 * The first call per user really logs in; later calls restore the cached cookie,
 * after checking with `validate` that the server still accepts it.
 */
Cypress.Commands.add("loginByApi", (username: string) => {
  cy.session(
    username,
    () => {
      withPassword((password) => {
        cy.request("POST", "/api/login", { username, password }).its("status").should("eq", 200);
      });
    },
    {
      validate() {
        cy.request("/api/me").its("body.username").should("eq", username);
      },
      cacheAcrossSpecs: true,
    },
  );
});

/**
 * Get an API token for a user WITHOUT touching the browser's cookies
 * ({"cookie": false}), so a scenario can prepare data as "maker1"
 * while the browser is logged in as "checker1".
 */
Cypress.Commands.add("apiToken", (username: string) =>
  cy
    .env<{ password: string }>(["password"])
    .then(({ password }) => cy.request("POST", "/api/login", { username, password, cookie: false }))
    .its("body.token"),
);

/** Create a payment through the API as the given maker and yield it. */
Cypress.Commands.add("createPayment", (username: string, overrides: Partial<NewPayment> = {}) =>
  cy.apiToken(username).then((token) =>
    cy
      .request<Payment>({
        method: "POST",
        url: "/api/payments",
        headers: { Authorization: `Bearer ${token}` },
        body: { ...DEFAULT_PAYMENT, ...overrides },
      })
      .its("body"),
  ),
);

/** Approve a payment through the API as the given checker. */
Cypress.Commands.add("approveAs", (username: string, paymentId: string) =>
  cy.apiToken(username).then((token) =>
    cy
      .request<Payment>({
        method: "POST",
        url: `/api/payments/${paymentId}/approve`,
        headers: { Authorization: `Bearer ${token}` },
      })
      .its("body"),
  ),
);

// TypeScript: tell the compiler about the new commands.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      getByCy(name: string): Chainable<JQuery<HTMLElement>>;
      loginByApi(username: string): Chainable<void>;
      apiToken(username: string): Chainable<string>;
      createPayment(username: string, overrides?: Partial<NewPayment>): Chainable<Payment>;
      approveAs(username: string, paymentId: string): Chainable<Payment>;
    }
  }
}

export {};
