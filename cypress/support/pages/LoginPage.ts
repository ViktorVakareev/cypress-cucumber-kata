// Page object for the sign-in view. Each method returns nothing: Cypress commands
// are queued, so there is no value to return. Assertions live in step definitions.

export const LoginPage = {
  visit(): void {
    cy.visit("/");
    cy.getByCy("login-view").should("be.visible");
  },

  signIn(username: string, password: string): void {
    cy.getByCy("username").clear().type(username);
    // { log: false } keeps the password out of the Cypress command log.
    cy.getByCy("password").clear().type(password, { log: false });
    cy.getByCy("login-submit").click();
  },

  error() {
    return cy.getByCy("login-error");
  },
};
