@login
Feature: Sign in
  As a payments user
  I want to sign in with my own account
  So that I only see and do what my role allows

  Background:
    Given I am on the sign-in page

  @smoke
  Scenario Outline: Each role can sign in
    When I sign in as "<user>" with the demo password
    Then I see the payments page as "<user> (<role>)"

    Examples:
      | user     | role    |
      | maker1   | maker   |
      | checker1 | checker |
      | viewer1  | viewer  |

  Scenario: A wrong password is rejected
    When I sign in as "maker1" with password "wrong-password"
    Then I see the sign-in error "Username or password is incorrect"

  Scenario: Signing out returns to the sign-in page
    When I sign in as "maker1" with the demo password
    And I sign out
    Then I see the sign-in page
