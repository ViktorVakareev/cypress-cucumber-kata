# Learning Cypress + Cucumber with this kata

A path from C#/.NET, Selenium and NUnit (plus SpecFlow-style Gherkin) to Cypress and Cucumber in TypeScript. Work through it in order. Each step points to real files in this repo, and the exercises at the end extend the suite.

## 0. Run it first

```powershell
npm ci
npm run start:test        # terminal 1: the app on http://localhost:3000 (test mode)
npm run cy:open           # terminal 2: Cypress runner -> E2E Testing -> Chrome -> pick a feature
```

Click through `login.feature` in the runner. Every command appears in the left-hand log; click one to "time travel" to the DOM at that moment. Then run everything headless: stop terminal 1 and run `npm run e2e`.

## 1. What you already know, in Cypress terms

| You know (C# / Selenium / NUnit / SpecFlow) | Here (TypeScript / Cypress / Cucumber) |
|---|---|
| `[Binding]` class with `[Given("...")]` methods | `Given("...", () => { ... })` in `cypress/support/step_definitions/*.ts`; no class, no attribute |
| SpecFlow `{string}` / regex parameters | Cucumber expressions: `{string}`, `{int}`, `{word}`, optional text `payment(s)`, alternatives `is/are` |
| `ScenarioContext["orderId"]` | Aliases: `cy.wrap(id).as("paymentId")` then `cy.get("@paymentId")` |
| `table.CreateInstance<T>()` | `table.rowsHash()` (vertical table) / `table.hashes()` (horizontal) |
| `[BeforeScenario]` | `Before(() => { ... })` in `hooks.ts` |
| `driver.FindElement(By.CssSelector(...))` | `cy.get("[data-cy=...]")` (or the custom `cy.getByCy("...")`) |
| `WebDriverWait.Until(...)` | Nothing extra: queries + assertions retry automatically (4 s default) |
| `Assert.That(x, Is.EqualTo(y))` | `.should("eq", y)`, `.should("have.text", "...")`, `.should("be.visible")` |
| `Thread.Sleep(...)` | `cy.wait(ms)`: same anti-pattern, don't |
| Page objects | Same idea (`cypress/support/pages/`), plus custom commands for app-level actions |
| RestSharp / HttpClient in tests | `cy.request({ method, url, headers, body, failOnStatusCode: false })` |
| NUnit `[Category("Smoke")]` + `--filter` | Gherkin tags `@smoke` + `--expose tags="@smoke"` |
| `TestContext` screenshot on failure | Automatic in `cypress run` (`cypress/screenshots/`) |

## 2. The one thing that's really different: the command queue

Cypress commands don't run when the line executes. They are **queued**, and Cypress runs them one after another later.

```ts
const row = cy.get('[data-cy="payment-row"]'); // NOT an element: a chainable "promise-like" handle
// Wrong:  if (row.length > 0) ...   -> there is no length here
// Right:
cy.get('[data-cy="payment-row"]').then(($rows) => {
  // here $rows is a jQuery object with the real elements
});
```

Consequences you'll see in this repo:

- Don't use `async/await` with `cy.*` commands.
- To pass a value to a later step, use an **alias** (`common.steps.ts`: `cy.wrap(payment.id).as("paymentId")`).
- Custom commands return the chain (`commands.ts`), so callers can keep chaining: `cy.createPayment("maker1").its("id")`.

## 3. Read the code in this order

1. **`cypress.config.ts`**: how `.feature` files become tests (Cucumber plugin + esbuild bundler).
2. **`cypress/e2e/features/login.feature`** + **`login.steps.ts`** + **`pages/LoginPage.ts`**: Background, Scenario Outline, thin steps over a page object.
3. **`commands.ts`**: `getByCy`, then `loginByApi` with **`cy.session`** (setup runs once per user; `validate` checks the cookie still works), then `apiToken` with `{"cookie": false}` and why.
4. **`hooks.ts`**: a `Before` hook that resets data so every scenario stands alone.
5. **`payments-ui.feature`** + **`payments-ui.steps.ts`**: a data table, `cy.intercept` + `cy.wait("@createPayment")`, then asserting the response status from the alias.
6. **`network.feature`** + **`network.steps.ts`**: `cy.intercept` stubbing a 503, delaying a real response, serving a fixture.
7. **`payments-api.feature`** + **`api.steps.ts`**: `cy.request` with `failOnStatusCode: false`; asserting status, headers and the error body.
8. **`tools/check-steps.mjs`**: how the Gherkin layer is checked without a browser.

## 4. Pitfalls worth remembering

| Pitfall | Why | Fix used here |
|---|---|---|
| `cy.intercept` after `cy.visit` for the first page load | The request already happened | Network `Given` steps come before `I am logged in as ...` |
| Intercept pattern too broad | `/api/payments` also matches `/api/payments/PAY-0001/approve` | `{ method: "GET", pathname: "/api/payments" }` |
| `cy.request` login overwrites the UI session cookie | `cy.request` stores `Set-Cookie` in the browser | API logins use `{"cookie": false}` + bearer token |
| Cached session dead after an app restart | Sessions live in server memory | `cy.session(..., { validate })` recreates it |
| Asserting 4xx with `cy.request` fails the test | Cypress fails non-2xx by default | `failOnStatusCode: false` |
| `Cypress.env("x")` doesn't compile | Removed in Cypress 16 | `cy.env(["password"]).then(...)` for secrets, `Cypress.expose()` for public values |
| `--env tags=@smoke` ignored | Cypress 16 uses `expose` | `--expose tags=@smoke` |
| Imperative Gherkin (`When I click the Approve button`) | Breaks on every UI change, unreadable for the business | `When I approve the payment "Office rent"` |

## 5. Exercises

Create a branch, write the scenario first, run `npm run check:steps` (it tells you which steps are undefined), then implement the steps and run the feature. Solutions are below each exercise; try first.

### Exercise 1: reuse only existing steps
**Goal:** a maker sees payments but no Approve/Reject buttons.
Add to `payments-ui.feature` using only steps that already exist.

<details><summary>Solution</summary>

```gherkin
  Scenario: A maker cannot approve payments
    Given "maker1" has submitted a payment of "300.00" EUR with reference "Supplier invoice"
    And I am logged in as "maker1"
    Then the payment "Supplier invoice" has no actions
```
</details>

### Exercise 2: a new API step
**Goal:** debtor and creditor IBAN must differ (400, field `creditorIban`, message "Creditor IBAN must differ from debtor IBAN").

<details><summary>Solution</summary>

```gherkin
  Scenario: Debtor and creditor must be different accounts
    When I POST a payment with creditor IBAN "BG80BNBG96611020345678"
    Then the response status is 400
    And the error is "VALIDATION_ERROR" on field "creditorIban" with message "Creditor IBAN must differ from debtor IBAN"
```
```ts
// api.steps.ts
When("I POST a payment with creditor IBAN {string}", (creditorIban: string) => {
  postPayment({ creditorIban });
});
```
(`DEFAULT_PAYMENT.debtorIban` is `BG80BNBG96611020345678`.)
</details>

### Exercise 3: Scenario Outline with a data table
**Goal:** submit payments in USD, GBP and JPY through the UI and check the formatted amount.

<details><summary>Solution</summary>

```gherkin
  Scenario Outline: Amounts are shown with the currency's precision
    Given I am logged in as "maker1"
    When I submit a payment with:
      | debtorIban   | BG80BNBG96611020345678 |
      | creditorIban | DE89370400440532013000 |
      | amount       | <amount>               |
      | currency     | <currency>             |
      | reference    | <reference>            |
    Then the payment API answered 201
    And the payment "<reference>" shows amount "<shown>" and status "Submitted"

    Examples:
      | amount  | currency | reference | shown          |
      | 1234.5  | USD      | US vendor | 1,234.50 USD   |
      | 0.01    | GBP      | Tiny one  | 0.01 GBP       |
      | 1500000 | JPY      | Yen bill  | 1,500,000 JPY  |
```
Note `1234.5` comes back as `1,234.50`: the app normalises to the currency's decimals.
</details>

### Exercise 4: stub a failing action with cy.intercept
**Goal:** if the approve call fails with 500, the user sees the error and the payment stays Submitted.

<details><summary>Solution</summary>

```gherkin
  Scenario: A failing approval is reported and nothing changes
    Given "maker1" has submitted a payment of "250.00" EUR with reference "Office rent"
    And the approve API fails with status 500
    And I am logged in as "checker1"
    When I click Approve for "Office rent"
    Then I see the error banner "Approval service down"
    And the payment "Office rent" has status "Submitted"
```
```ts
// network.steps.ts
Given("the approve API fails with status {int}", (statusCode: number) => {
  cy.intercept("POST", "**/api/payments/*/approve", {
    statusCode,
    body: { error: { code: "DOWN", message: "Approval service down" } },
  }).as("approve");
});

// payments-ui.steps.ts: a click without its own intercept (the stub above is used)
When("I click Approve for {string}", (reference: string) => {
  PaymentsPage.clickAction(reference, "approve");
  cy.wait("@approve");
});
```
Why a new "click" step and not `I approve the payment`? That step registers its own pass-through intercept with the same alias, which would replace your stub's alias.
</details>

### Exercise 5: a custom command
**Goal:** `cy.rejectAs("checker1", id)`, and a Given step "{string} has rejected it". Don't forget the TypeScript declaration in `commands.ts`, then run `npm run typecheck`.

### Exercise 6: tags
Tag one scenario `@wip`, run only it with `npx cypress run --expose tags="@wip"`, then run everything except it: `--expose tags="not @wip"`.

### Exercise 7: see a flaky test being born
In `payments-ui.steps.ts`, temporarily replace `cy.wait("@approve")` with nothing, and change the status assertion step to read the text once with `.then(($el) => expect($el.text()).to.eq(status))` instead of `.should(...)`. Run it a few times and explain why it now fails sometimes (`.then` doesn't retry; `.should` does). Then revert.

## 6. Talking about it in an interview

- "Cypress runs inside the browser, so it waits automatically and can control the network; the trade-offs are JavaScript/TypeScript only, one tab, and `cy.origin()` for other domains."
- "I keep step definitions thin: they call page objects and custom commands, the same layering as in my C# framework."
- "Test data goes through the API with `cy.request`, logins are cached with `cy.session`, and I wait on `cy.intercept` aliases, never on time."
- "BDD pays off when product owners read the features; I write them in business language, not clicks."
