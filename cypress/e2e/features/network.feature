@network
Feature: Network conditions (cy.intercept)
  The UI must behave well when the API is slow, failing or returns unusual data.
  cy.intercept() lets the test control the network without changing the app.

  Scenario: The list shows an error banner when the API fails
    Given the payments list API fails with status 503
    And I am logged in as "checker1"
    Then I see the error banner "Could not load payments: Service unavailable"

  Scenario: A loading indicator shows while the API is slow
    Given the payments list API responds after 1500 ms
    And I am logged in as "checker1"
    Then I see the loading indicator
    And after the payments list loads I see "No payments yet."

  Scenario: Amounts are formatted with thousand separators and currency precision
    Given the payments list API returns the fixture "payments-list.json"
    And I am logged in as "viewer1"
    Then the payment "Bond coupon" shows amount "1,234,567.89 EUR" and status "Approved"
    And the payment "Tokyo office" shows amount "1,500,000 JPY" and status "Submitted"
    And the payment "Small refund" shows amount "0.01 GBP" and status "Rejected"
