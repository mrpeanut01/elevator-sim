/**
 * Sending mail, behind an interface with a driver that sends none.
 *
 * `DECISIONS.md` § D214 § 5. The confirmation flow has to be testable end to end — register,
 * receive, click, confirm — without a network, a domain or a credential, and it has to become a
 * real sender later without any caller changing. One method and two drivers is the whole design.
 *
 * **No credential is committed.** The SMTP driver reads its configuration from the environment and
 * this package ships none; the dev driver needs none because it does not connect to anything.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** One message. Deliberately minimal: this product sends exactly one kind of mail. */
export interface Message {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * Anything that can deliver a {@link Message}.
 *
 * Async and allowed to throw. A caller that cannot send must decide whether that fails the request
 * — for registration it does, because an account whose confirmation mail was silently dropped is an
 * account the player can never use and will never be told why.
 */
export interface Mailer {
  send(message: Message): Promise<void>;
}

/* -------------------------------------------------------------------------- *
 * The development driver
 * -------------------------------------------------------------------------- */

/**
 * Appends each message to a file as JSON lines.
 *
 * This is not a stub that throws away its input — that would make the flow untestable at exactly
 * the step worth testing. The outbox is readable, so a test (or a developer with no mail server)
 * can register an account, read the confirmation link out of the outbox, and complete the flow.
 *
 * **It is a development driver and says so.** Anything in the outbox is in the clear on disk, so a
 * server configured with this in production would be writing confirmation links to a file. The
 * bootstrap refuses that combination rather than trusting the operator to notice.
 */
export class OutboxMailer implements Mailer {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  async send(message: Message): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`, 'utf8');
  }

  /** Every message sent so far, oldest first. For tests and for a developer reading their own mail. */
  async delivered(): Promise<readonly Message[]> {
    let text: string;
    try {
      text = await readFile(this.#path, 'utf8');
    } catch {
      return [];
    }
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Message);
  }
}

/* -------------------------------------------------------------------------- *
 * Composing the message
 * -------------------------------------------------------------------------- */

/**
 * The confirmation mail.
 *
 * Written as a function of the link rather than of the token, so no caller is tempted to build the
 * URL twice and get the two copies out of step — the link in the mail is the only one there is.
 *
 * The body says what the account cannot do until it is confirmed, because "confirm your email" with
 * no consequence attached is a message people reasonably ignore.
 */
export function confirmationMessage(to: string, link: string): Message {
  return Object.freeze({
    to,
    subject: 'Confirm your Elevator Sim account',
    body: [
      'Confirm your address to finish setting up your Elevator Sim account:',
      '',
      link,
      '',
      'You can sign in and play before confirming. You cannot post a score to a leaderboard',
      'until you do — that is what keeps the boards from being farmed with throwaway addresses.',
      '',
      'The link is good for 24 hours. If you did not create this account, ignore this message:',
      'nothing was set up in your name and the link will expire on its own.',
    ].join('\n'),
  });
}
