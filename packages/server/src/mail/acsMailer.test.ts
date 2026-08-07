/**
 * The production mailer's **selection**, which is the half that decides whether a server boots.
 *
 * Nothing here sends mail or reaches Azure. What it asserts is the thing that was actually broken:
 * `bootstrap` refused `NODE_ENV=production` with the outbox driver, the outbox driver was the only
 * `Mailer` in the tree, and therefore *no environment existed in which this server could start in
 * production*. That is not a configuration gap, it is an unsatisfiable refusal, and a test that
 * only checked the refusal fires would have stayed green through the whole of it.
 *
 * So the load-bearing case here is the **positive** one: an environment that configures ACS boots.
 */

import { describe, expect, it } from 'vitest';

import { AcsMailer, MailerConfigurationError, acsMailerFrom } from './acsMailer.js';
import { OutboxMailer } from './mailer.js';

const ENDPOINT = 'https://example.communication.azure.com';
// Shaped like a real one and valid nowhere. `EmailClient` parses it at construction, so it has to
// be well-formed; the key is sixteen bytes of base64 padding and authorises nothing.
const CONNECTION_STRING = `endpoint=${ENDPOINT}/;accesskey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

describe('choosing a mailer from the environment', () => {
  it('returns nothing when the environment configures no mail at all', () => {
    // The development case, and the only one `bootstrap` may answer with the outbox driver.
    expect(acsMailerFrom({})).toBeUndefined();
    expect(acsMailerFrom({ ELEVATOR_SIM_MAIL_FROM: 'DoNotReply@example.azurecomm.net' })).toBeUndefined();
  });

  it('builds a real mailer from an endpoint, which is the keyless credential', () => {
    const mailer = acsMailerFrom({
      ELEVATOR_SIM_ACS_ENDPOINT: ENDPOINT,
      ELEVATOR_SIM_MAIL_FROM: 'DoNotReply@example.azurecomm.net',
    });
    expect(mailer).toBeInstanceOf(AcsMailer);
    // Not the outbox driver, which is the whole point: this is the object `bootstrap`'s production
    // refusal tests `instanceof` against.
    expect(mailer).not.toBeInstanceOf(OutboxMailer);
  });

  it('builds a real mailer from a connection string too', () => {
    expect(
      acsMailerFrom({
        ELEVATOR_SIM_ACS_CONNECTION_STRING: CONNECTION_STRING,
        ELEVATOR_SIM_MAIL_FROM: 'DoNotReply@example.azurecomm.net',
      }),
    ).toBeInstanceOf(AcsMailer);
  });

  it('refuses a credential with no sender address, rather than failing at the first registration', () => {
    // ACS rejects an unverified sender at send time. Without this, the failure surfaces as every
    // registration failing after the account row was already written — the confirmation mail is
    // the one part of that flow with no second chance.
    expect(() => acsMailerFrom({ ELEVATOR_SIM_ACS_ENDPOINT: ENDPOINT })).toThrow(MailerConfigurationError);
  });

  it('refuses a sender address with no credential at all', () => {
    expect(() => new AcsMailer({ senderAddress: 'DoNotReply@example.azurecomm.net' })).toThrow(
      MailerConfigurationError,
    );
  });
});
