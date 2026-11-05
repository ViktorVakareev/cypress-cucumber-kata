@api
Feature: Payments REST API (cy.request)
  The same rules as the UI, checked directly at API level:
  faster, more precise, no browser rendering involved.

  Background:
    Given I have an API token for "maker1"

  @smoke
  Scenario: Creating a payment returns 201 and a Location header
    When I POST a payment of "100.00" EUR
    Then the response status is 201
    And the response header "location" is "/api/payments/PAY-0001"
    And the response field "status" is "Submitted"

  Scenario Outline: Amount boundaries and currency precision
    When I POST a payment of "<amount>" <currency>
    Then the response status is <status>

    Examples:
      | amount      | currency | status |
      | 0.00        | EUR      | 400    |
      | 0.01        | EUR      | 201    |
      | 10000000.00 | EUR      | 201    |
      | 10000000.01 | EUR      | 400    |
      | 1.005       | EUR      | 400    |
      | 1500        | JPY      | 201    |
      | 1.5         | JPY      | 400    |

  Scenario: An invalid IBAN gives a 400 that names the field
    When I POST a payment with debtor IBAN "DE89370400440532013001"
    Then the response status is 400
    And the error is "VALIDATION_ERROR" on field "debtorIban" with message "Debtor IBAN is not valid"

  Scenario: No token gives 401
    Given I have no API token
    When I POST a payment of "100.00" EUR
    Then the response status is 401

  Scenario: A viewer gets 403
    Given I have an API token for "viewer1"
    When I POST a payment of "100.00" EUR
    Then the response status is 403

  Scenario: Retrying with the same Idempotency-Key creates only one payment
    When I POST a payment of "100.00" EUR with Idempotency-Key "retry-123"
    And I POST a payment of "100.00" EUR with Idempotency-Key "retry-123"
    Then the response status is 200
    And the response header "idempotent-replay" is "true"
    And there is 1 payment

  Scenario: The same checker cannot approve twice (409)
    Given "maker1" has submitted a payment of "2500000.00" EUR with reference "Loan disbursement"
    And "checker1" has approved it
    When "checker1" approves it through the API
    Then the response status is 409
    And the error code is "ALREADY_APPROVED"
