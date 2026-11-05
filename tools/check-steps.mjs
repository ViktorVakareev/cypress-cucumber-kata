// Dry run for the Cucumber layer, without a browser:
//  - parses every .feature file (Gherkin syntax errors fail here),
//  - expands Scenario Outlines into concrete steps,
//  - checks that every step matches exactly ONE step definition (none = undefined, 2+ = ambiguous),
//  - lists step definitions that no feature uses.
// Run: npm run check:steps

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { CucumberExpression, ParameterTypeRegistry } from "@cucumber/cucumber-expressions";

const ROOT = process.cwd();

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return full.endsWith(ext) ? [full] : [];
  });
}

// 1. Step definitions: Given/When/Then("...") in the TypeScript files.
const registry = new ParameterTypeRegistry();
const definitions = [];
for (const file of walk(join(ROOT, "cypress/support/step_definitions"), ".ts")) {
  const source = readFileSync(file, "utf8");
  const pattern = /\b(?:Given|When|Then)\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const match of source.matchAll(pattern)) {
    const text = match[1];
    definitions.push({ text, file: relative(ROOT, file), expression: new CucumberExpression(text, registry), used: 0 });
  }
}

// 2. Features -> pickles (one per scenario / outline example row).
const newId = IdGenerator.uuid();
const problems = [];
let stepCount = 0;
let scenarioCount = 0;
const features = walk(join(ROOT, "cypress/e2e"), ".feature");
for (const file of features) {
  const data = readFileSync(file, "utf8");
  const parser = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher());
  const document = parser.parse(data);
  const pickles = compile(document, relative(ROOT, file), newId);
  scenarioCount += pickles.length;
  for (const pickle of pickles) {
    for (const step of pickle.steps) {
      stepCount += 1;
      const matches = definitions.filter((d) => d.expression.match(step.text) !== null);
      matches.forEach((d) => (d.used += 1));
      if (matches.length === 0) problems.push(`UNDEFINED  ${relative(ROOT, file)}: "${step.text}"`);
      if (matches.length > 1) {
        problems.push(`AMBIGUOUS  ${relative(ROOT, file)}: "${step.text}" -> ${matches.map((m) => m.text).join(" | ")}`);
      }
    }
  }
}

const unused = definitions.filter((d) => d.used === 0);

console.log(`Features:          ${features.length}`);
console.log(`Scenarios:         ${scenarioCount} (Scenario Outline rows counted separately)`);
console.log(`Steps:             ${stepCount}`);
console.log(`Step definitions:  ${definitions.length}`);
for (const d of unused) console.log(`UNUSED     ${d.file}: "${d.text}"`);
for (const p of problems) console.log(p);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log("\nEvery step matches exactly one step definition.");
