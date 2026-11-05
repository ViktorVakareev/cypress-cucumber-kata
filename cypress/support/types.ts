// Shapes of the app's API, shared by commands and step definitions.

export type Role = "maker" | "checker" | "viewer";

export type PaymentStatus = "Submitted" | "Awaiting second approval" | "Approved" | "Rejected";

export interface Payment {
  id: string;
  debtorIban: string;
  creditorIban: string;
  amount: string; // decimal string, e.g. "1500.00"
  currency: "EUR" | "USD" | "GBP" | "JPY";
  reference: string;
  status: PaymentStatus;
  createdBy: string;
  approvals: string[];
  requiresSecondApproval: boolean;
  createdAt: string;
}

export interface NewPayment {
  debtorIban: string;
  creditorIban: string;
  amount: string;
  currency: string;
  reference: string;
}

export interface ApiError {
  error: { code: string; message: string; field?: string };
}

/** A valid payment; tests override only the fields they are about. */
export const DEFAULT_PAYMENT: NewPayment = {
  debtorIban: "BG80BNBG96611020345678",
  creditorIban: "DE89370400440532013000",
  amount: "100.00",
  currency: "EUR",
  reference: "Kata payment",
};
