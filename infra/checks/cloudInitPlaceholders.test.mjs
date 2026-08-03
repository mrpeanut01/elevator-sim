/**
 * `cloud-init.yaml` is a template, and `main.bicep` is the only thing that fills it in. Nothing
 * type-checks the join.
 *
 * This test exists because the first draft got it wrong: `__ADMIN_USERNAME__` appeared in the
 * cloud-config and in no `replace()` call, so the compiled template would have deployed a machine
 * that created a Linux user literally named `__ADMIN_USERNAME__`. Bicep compiled it without a
 * warning — correctly, since as far as Bicep is concerned the file is an opaque string — and a
 * deployment would have "succeeded".
 *
 * That is the repository's own standing defect wearing infrastructure clothes: a configured thing
 * that is validated in isolation and reaches nothing. So the seam gets a caller check, in both
 * directions.
 *
 * Run with `node --test 'infra/checks/*.test.mjs'`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (name) => readFileSync(fileURLToPath(new URL(`../azure/${name}`, import.meta.url)), 'utf8');

const CLOUD_INIT = read('cloud-init.yaml');
const BICEP = read('main.bicep');

const PLACEHOLDER = /__[A-Z][A-Z0-9_]*__/g;

/** Everything the cloud-config expects to have filled in. */
const required = new Set(CLOUD_INIT.match(PLACEHOLDER) ?? []);

/** Everything main.bicep offers to fill in — only the ones inside a `replace()` argument count. */
const supplied = new Set((BICEP.match(/'__[A-Z][A-Z0-9_]*__'/g) ?? []).map((quoted) => quoted.slice(1, -1)));

test('the cloud-config has placeholders at all', () => {
  // Anti-vacuity, in the shape scripts/review-gates.mjs uses: if the scan finds nothing, every
  // assertion below is trivially true and the guard has stopped guarding.
  assert.ok(required.size >= 5, `found only ${String(required.size)} placeholder(s) in cloud-init.yaml; the scan is broken, not the file`);
});

test('every placeholder in cloud-init.yaml is substituted by main.bicep', () => {
  const unsubstituted = [...required].filter((name) => !supplied.has(name));
  assert.deepEqual(
    unsubstituted,
    [],
    `these reach the VM verbatim: ${unsubstituted.join(', ')}. Add a replace() to main.bicep's cloudInit chain.`,
  );
});

test('main.bicep substitutes nothing cloud-init.yaml does not ask for', () => {
  // The other direction, because a `replace()` for a placeholder that no longer exists is a
  // substitution nobody is receiving — the same shape as a docstring naming a caller that does not
  // call, which packages/viz/src/deadCode.test.ts found twice.
  const orphaned = [...supplied].filter((name) => !required.has(name));
  assert.deepEqual(orphaned, [], `main.bicep replaces placeholders that are not in cloud-init.yaml: ${orphaned.join(', ')}`);
});

test('no credential is templated into the machine image', () => {
  // The credential the runners need is fetched at boot from Key Vault by managed identity. If a
  // placeholder ever appears whose name suggests otherwise, the design has changed and this test
  // should be the thing that says so.
  const suspicious = [...required, ...supplied].filter((name) => /SECRET_VALUE|PASSWORD|PAT|PRIVATE_KEY|CREDENTIAL_VALUE/.test(name));
  assert.deepEqual(suspicious, [], `customData is stored on the scale set model and readable by anyone with reader on it: ${suspicious.join(', ')}`);
});
