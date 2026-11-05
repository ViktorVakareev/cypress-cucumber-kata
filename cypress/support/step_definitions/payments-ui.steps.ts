import { DataTable, Then, When } from "@badeball/cypress-cucumber-preprocessor";
import { PaymentsPage } from "../pages/PaymentsPage";
import { NewPayment } from "../types";

When("I submit a payment with:", (table: DataTable) => {
  // A vertical data table -> { debtorIban: "...", amount: "...", ... }
  const payment = table.rowsHash() as Partial<NewPayment>;
  // Register the intercept BEFORE the action, then wait on the alias: no fixed sleeps.
  cy.intercept({ method: "POST", pathname: "/api/payments" }).as("createPayment");
  PaymentsPage.fillNewPayment(payment);
  PaymentsPage.submit();
  cy.wait("@createPayment");
});

Then("the payment API answered {int}", (status: number) => {
  // cy.get on an intercept alias yields the last matching request/response.
  cy.get("@createPayment").its("response.statusCode").should("eq", status);
});

Then(
  "the payment {string} shows amount {string} and status {string}",
  (reference: string, amount: string, status: string) => {
    PaymentsPage.amount(reference).should("have.text", amount);
    PaymentsPage.status(reference).should("have.text", status);
  },
);

Then("I see the form error {string}", (message: string) => {
  cy.getByCy("form-error").should("be.visible").and("have.text", message);
});

Then("I do not see the new payment form", () => {
  cy.getByCy("payments-view").should("be.visible");
  cy.getByCy("new-payment").should("not.be.visible");
});

When("I approve the payment {string}", (reference: string) => {
  cy.intercept("POST", "**/api/payments/*/approve").as("approve");
  PaymentsPage.clickAction(reference, "approve");
  cy.wait("@approve");
});

When("I reject the payment {string}", (reference: string) => {
  cy.intercept("POST", "**/api/payments/*/reject").as("reject");
  PaymentsPage.clickAction(reference, "reject");
  cy.wait("@reject");
});

Then("the payment {string} has status {string}", (reference: string, status: string) => {
  // Retries until the table re-renders with the new status (default 4 s).
  PaymentsPage.status(reference).should("have.text", status);
});

Then("the payment {string} has no actions", (reference: string) => {
  PaymentsPage.row(reference).find('[data-cy="approve"]').should("not.exist");
  PaymentsPage.row(reference).find('[data-cy="reject"]').should("not.exist");
});
