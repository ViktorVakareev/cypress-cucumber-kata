@ui
Feature: Payments in the UI (maker-checker)
  Makers submit payments, checkers approve or reject them.
  Payments of 1,000,000.00 or more need two different checkers.

  @smoke
  Scenario: A maker submits a payment
    Given I am logged in as "maker1"
    When I submit a payment with:
      | debtorIban   | BG80 BNBG 9661 1020 3456 78 |
      | creditorIban | DE89 3704 0044 0532 0130 00 |
      | amount       | 1500.00                     |
      | currency     | EUR                         |
      | reference    | Invoice 1001                |
    Then the payment API answered 201
    And the payment "Invoice 1001" shows amount "1,500.00 EUR" and status "Submitted"

  Scenario: An invalid IBAN is rejected with a clear message
    Given I am logged in as "maker1"
    When I submit a payment with:
      | debtorIban   | BG80BNBG96611020345679 |
      | creditorIban | DE89370400440532013000 |
      | amount       | 50.00                  |
      | currency     | EUR                    |
      | reference    | Wrong IBAN             |
    Then the payment API answered 400
    And I see the form error "Debtor IBAN is not valid"

  Scenario: A viewer cannot create payments
    Given I am logged in as "viewer1"
    Then I do not see the new payment form

  Scenario: A checker approves a small payment
    Given "maker1" has submitted a payment of "250.00" EUR with reference "Office rent"
    And I am logged in as "checker1"
    When I approve the payment "Office rent"
    Then the payment "Office rent" has status "Approved"
    And the payment "Office rent" has no actions

  Scenario: A checker rejects a payment
    Given "maker1" has submitted a payment of "75.00" EUR with reference "Duplicate invoice"
    And I am logged in as "checker1"
    When I reject the payment "Duplicate invoice"
    Then the payment "Duplicate invoice" has status "Rejected"

  Scenario: A large payment needs a second, different checker
    Given "maker1" has submitted a payment of "2500000.00" EUR with reference "Loan disbursement"
    And "checker1" has approved it
    And I am logged in as "checker2"
    Then the payment "Loan disbursement" has status "Awaiting second approval"
    When I approve the payment "Loan disbursement"
    Then the payment "Loan disbursement" has status "Approved"

  Scenario: The first checker cannot approve the same payment twice
    Given "maker1" has submitted a payment of "2500000.00" EUR with reference "Loan disbursement"
    And "checker1" has approved it
    And I am logged in as "checker1"
    When I approve the payment "Loan disbursement"
    Then I see the error banner "The same checker cannot approve twice"
