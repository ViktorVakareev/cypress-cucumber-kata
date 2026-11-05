// Page object for the payments view.

import { NewPayment } from "../types";

export const PaymentsPage = {
  /** The table row whose text contains the reference (retries until it appears). */
  row(reference: string) {
    return cy.contains('[data-cy="payment-row"]', reference);
  },

  fillNewPayment(payment: Partial<NewPayment>): void {
    const fields: Array<[keyof NewPayment, string]> = [
      ["debtorIban", "debtor-iban"],
      ["creditorIban", "creditor-iban"],
      ["amount", "amount"],
      ["reference", "reference"],
    ];
    for (const [key, selector] of fields) {
      const value = payment[key];
      if (value !== undefined) cy.getByCy(selector).clear().type(value);
    }
    if (payment.currency) cy.getByCy("currency").select(payment.currency);
  },

  submit(): void {
    cy.getByCy("submit-payment").click();
  },

  clickAction(reference: string, action: "approve" | "reject"): void {
    PaymentsPage.row(reference).find(`[data-cy="${action}"]`).click();
  },

  status(reference: string) {
    return PaymentsPage.row(reference).find('[data-cy="payment-status"]');
  },

  amount(reference: string) {
    return PaymentsPage.row(reference).find('[data-cy="payment-amount"]');
  },
};
