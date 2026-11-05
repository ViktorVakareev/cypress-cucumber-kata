import { Given, Then, When } from "@badeball/cypress-cucumber-preprocessor";
import { LoginPage } from "../pages/LoginPage";

Given("I am on the sign-in page", () => {
  LoginPage.visit();
});

When("I sign in as {string} with the demo password", (username: string) => {
  cy.env<{ password: string }>(["password"]).then(({ password }) => LoginPage.signIn(username, password));
});

When("I sign in as {string} with password {string}", (username: string, password: string) => {
  LoginPage.signIn(username, password);
});

When("I sign out", () => {
  cy.getByCy("logout").click();
});

Then("I see the payments page as {string}", (who: string) => {
  cy.getByCy("payments-view").should("be.visible");
  cy.getByCy("current-user").should("have.text", who);
});

Then("I see the sign-in error {string}", (message: string) => {
  LoginPage.error().should("be.visible").and("have.text", message);
});

Then("I see the sign-in page", () => {
  cy.getByCy("login-view").should("be.visible");
  cy.getByCy("payments-view").should("not.be.visible");
});
