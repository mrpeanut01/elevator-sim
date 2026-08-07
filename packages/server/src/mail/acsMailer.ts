/**
 * The production mail driver: Azure Communication Services Email.
 *
 * `mailer.ts` promised this file existed — *"the SMTP driver reads its configuration from the
 * environment"* — and it did not. `bootstrap.ts` refuses to run in production with the outbox
 * driver, and the outbox driver was the only {@link Mailer} in the tree, so the server could not
 * boot with `NODE_ENV=production` at all. That was a docstring describing a plan as though it were
 * a fact, which is the class of defect this repository has a standing rule about. This is the
 * driver, and `bootstrap.ts` now selects it rather than describing it.
 *
 * ## Two ways to authenticate, and why both are here
 *
 * **Managed identity** (`ELEVATOR_SIM_ACS_ENDPOINT`) is the one to deploy. A Container App with a
 * user-assigned identity holding the *Communication and Email Service Owner* role sends mail with
 * no secret anywhere — nothing in the image, nothing in the environment, nothing to rotate, and
 * revocation is removing a role assignment. `DefaultAzureCredential` also picks up a developer's
 * `az login` locally, so the same path works on a laptop.
 *
 * **A connection string** (`ELEVATOR_SIM_ACS_CONNECTION_STRING`) is the fallback, because it works
 * before any role assignment has propagated and is the only option outside Azure. It carries an
 * access key, so it is a secret in the real sense: it belongs in a secret store and never in the
 * image or in `git`.
 *
 * The endpoint wins when both are set. That ordering is deliberate — the safer credential should
 * not be the one a stray environment variable can silently downgrade.
 *
 * **No credential is committed and no default exists for either.** A mailer that fell back to
 * something on missing configuration would be a mailer that appears to work and delivers nothing.
 */

import { EmailClient, type EmailMessage } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';

import type { Mailer, Message } from './mailer.js';

/** Thrown when the environment does not describe a sender this driver can actually use. */
export class MailerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailerConfigurationError';
  }
}

export interface AcsMailerOptions {
  /**
   * The address mail is sent from.
   *
   * Must be on a domain the Communication Service has verified — `DoNotReply@<guid>.azurecomm.net`
   * for the free test subdomain, or an address on your own domain once it is connected. ACS refuses
   * anything else at send time, so a wrong value here fails every registration rather than landing
   * in spam, which is the better of the two failures and worth knowing about.
   */
  readonly senderAddress: string;
  /** `https://<resource>.communication.azure.com`. Authenticates with a managed identity. */
  readonly endpoint?: string | undefined;
  /** The alternative to {@link endpoint}: carries an access key, so it is a real secret. */
  readonly connectionString?: string | undefined;
}

export class AcsMailer implements Mailer {
  readonly #client: EmailClient;
  readonly #senderAddress: string;

  constructor(options: AcsMailerOptions) {
    if (options.senderAddress.trim().length === 0) {
      throw new MailerConfigurationError(
        'ELEVATOR_SIM_MAIL_FROM is empty. It must be an address on a domain the Communication ' +
          'Service has verified, e.g. DoNotReply@<guid>.azurecomm.net.',
      );
    }
    this.#senderAddress = options.senderAddress;

    // The endpoint first: see the header. A connection string arriving alongside an endpoint must
    // not be able to quietly replace a keyless credential with a key.
    if (options.endpoint !== undefined && options.endpoint.trim().length > 0) {
      this.#client = new EmailClient(options.endpoint, new DefaultAzureCredential());
    } else if (options.connectionString !== undefined && options.connectionString.trim().length > 0) {
      this.#client = new EmailClient(options.connectionString);
    } else {
      throw new MailerConfigurationError(
        'No Azure Communication Services credential. Set ELEVATOR_SIM_ACS_ENDPOINT to use the ' +
          "container's managed identity (preferred — no secret to hold or rotate), or " +
          'ELEVATOR_SIM_ACS_CONNECTION_STRING to use an access key.',
      );
    }
  }

  /**
   * Send, and **wait for the service to accept it**.
   *
   * `beginSend` returns a poller because ACS accepts the message and delivers asynchronously.
   * Awaiting it is the difference between "Azure has this" and "we handed it to a socket": the
   * caller in `api.ts` fails a registration when this rejects, and it can only do that honestly if
   * a resolved promise means the service took responsibility for the message.
   *
   * Delivery itself is still not guaranteed by a resolved promise — no mail API can promise that —
   * and this does not pretend otherwise.
   */
  async send(message: Message): Promise<void> {
    const email: EmailMessage = {
      senderAddress: this.#senderAddress,
      content: { subject: message.subject, plainText: message.body },
      recipients: { to: [{ address: message.to }] },
    };
    const poller = await this.#client.beginSend(email);
    const result = await poller.pollUntilDone();
    if (result.status !== 'Succeeded') {
      // The status and the id, and no more. Whatever the caller does with this must not put the
      // recipient's address into a log line that was not already going to hold it.
      throw new Error(`Azure Communication Services did not accept the message: ${result.status} (${result.id})`);
    }
  }
}

/**
 * Build the production mailer from the environment, or say precisely what is missing.
 *
 * Separate from the constructor so `bootstrap.ts` can ask *"is this environment configured for
 * real mail?"* without a `try`/`catch` around a constructor deciding control flow. Returns
 * `undefined` when nothing is configured at all — which is the development case, and the one
 * `bootstrap` is allowed to answer with the outbox driver.
 */
export function acsMailerFrom(env: Readonly<Record<string, string | undefined>>): AcsMailer | undefined {
  const endpoint = env['ELEVATOR_SIM_ACS_ENDPOINT'];
  const connectionString = env['ELEVATOR_SIM_ACS_CONNECTION_STRING'];
  const configured =
    (endpoint !== undefined && endpoint.trim().length > 0) ||
    (connectionString !== undefined && connectionString.trim().length > 0);
  if (!configured) return undefined;

  return new AcsMailer({
    senderAddress: env['ELEVATOR_SIM_MAIL_FROM'] ?? '',
    endpoint,
    connectionString,
  });
}
