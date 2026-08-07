/**
 * Sending mail, behind an interface with a driver that sends none.
 *
 * `DECISIONS.md` § D214 § 5, as amended by § D241. The sign-in flow has to be testable end to end —
 * ask for a link, receive it, redeem it — without a network, a domain or a credential, and it has to
 * become a real sender later without any caller changing. One method and two drivers is the whole
 * design.
 *
 * **Since § D241 the mailer is on the critical path of every login, not of registration alone.** It
 * was one message at the start of an account's life; it is now the only way into one. A mailer that
 * silently drops is no longer an inconvenience that costs a confirmation, it is a locked door, which
 * is why `http/api.ts` awaits the send and fails the request when it rejects.
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
 * can ask for a sign-in link, read it out of the outbox, and complete the flow.
 *
 * **It is a development driver and says so.** Anything in the outbox is in the clear on disk, so a
 * server configured with this in production would be writing **sign-in** links to a file — and
 * since § D241 each one is not a confirmation but a working key to the account it names. The
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
 * The sign-in mail — the only mail this product sends, and the only way into an account.
 *
 * Written as a function of the link rather than of the token, so no caller is tempted to build the
 * URL twice and get the two copies out of step — the link in the mail is the only one there is.
 *
 * Two sentences in the body are load-bearing rather than decorative, and § D241 records why.
 *
 * **"If you did not ask for this, ignore it."** This endpoint is unauthenticated and creates an
 * account for an address that does not have one, so somebody who never used this product can
 * receive this mail because a stranger typed their address. The message has to be readable as
 * *nothing has happened* by a person who has no idea what Elevator Sim is.
 *
 * **The minutes are named.** A link that has quietly expired and a link that never worked look
 * identical to a reader, and the difference is whether asking for another one helps.
 */
export function signInMessage(to: string, link: string, validForMinutes: number): Message {
  return Object.freeze({
    to,
    subject: 'Your Elevator Sim sign-in link',
    body: [
      'Open this link to sign in to Elevator Sim:',
      '',
      link,
      '',
      `It works once and expires ${String(validForMinutes)} minutes after it was sent. Opening it`,
      'signs this browser in; there is no password to remember and none to lose.',
      '',
      'If you did not ask to sign in, ignore this message. Nothing has been set up in your name',
      'that this link expiring does not undo, and nobody can use it but the person reading it.',
    ].join('\n'),
  });
}
