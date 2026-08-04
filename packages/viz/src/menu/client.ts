/**
 * Talking to the account and leaderboard server, over an **injected** transport.
 *
 * `DECISIONS.md` § D214 § 6 makes the wire plain HTTP + JSON, and this is the client half of it.
 * The transport is a parameter rather than a global `fetch` for the same reason `menu/menu.ts` has
 * no `document` in it: a network call made through an ambient global is a call no test can drive,
 * and the interesting cases here are all failures — a server that is down, a body that is not JSON,
 * a 422 that means *"your score did not replay"* and must not read as an accusation.
 *
 * ## Nothing here throws
 *
 * Every method returns a discriminated result. A menu that had to wrap each call in a `try` would
 * grow one `catch` per screen, and the one that got forgotten would show a player a blank panel
 * with no words on it. `Failure.detail` is always something that can be put on screen as-is.
 *
 * ## What this client deliberately does not do
 *
 * It does not compute a score, and it does not decide whether a run is quotable. The server
 * re-simulates and measures for itself (§ D214 § 3); a client-side figure is a *claim*, and this
 * module's job is to carry the claim, not to believe it.
 */

/* -------------------------------------------------------------------------- *
 * The wire types
 * -------------------------------------------------------------------------- */

/** A signed-in player, as the server describes them. */
export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  /** Unconfirmed accounts may play; they may not post a score. § D214 § 5. */
  readonly confirmed: boolean;
}

/** The run half of a submission — the same fields Free Play selects, by construction. */
export interface RunSubmission {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  readonly seed: string;
}

export interface ClaimedMetrics {
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  readonly awtIsValid: boolean;
}

export interface BoardEntry {
  readonly id: string;
  readonly displayName: string;
  readonly run: RunSubmission;
  readonly measured: ClaimedMetrics;
  readonly submittedAtMs: number;
}

export interface BoardPage {
  readonly configHash: string;
  readonly metric: string;
  /** The server's own sentence about what the ranking means. Shown, never paraphrased. */
  readonly note: string;
  readonly entries: readonly BoardEntry[];
}

export interface BoardSummary {
  readonly configHash: string;
  readonly entries: number;
  readonly latestMs: number;
}

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * A failure, as something a panel can render without interpreting.
 *
 * `code` is the server's machine-readable reason where it gave one, or one of this module's own
 * transport codes. `detail` is always a sentence. **A rejection is not an accusation** — the server
 * says so explicitly for `metrics-do-not-reproduce`, and the client must not dress it up as one.
 */
export interface Failure {
  readonly ok: false;
  readonly code: string;
  readonly detail: string;
  /** Field-level problems, when the server reported a list of them. */
  readonly issues: readonly string[];
}

export type Result<T> = Success<T> | Failure;

/* -------------------------------------------------------------------------- *
 * The transport
 * -------------------------------------------------------------------------- */

/** One request, as this module makes them. */
export interface TransportRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly token: string | undefined;
  readonly body: unknown;
}

/** One response. Deliberately not a `Response`: nothing here should need a DOM to be tested. */
export interface TransportResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Anything that can carry a request. May reject; {@link createClient} catches. */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

/* -------------------------------------------------------------------------- *
 * The wordings this module owns
 * -------------------------------------------------------------------------- */

/**
 * The three sentences the client authors itself, in one table.
 *
 * Every other sentence a player sees from a failed request is the **server's**, carried through
 * untouched — a rejection is not an accusation and the server is the one place that decides how one
 * is worded. These three have no server to come from: the request never arrived, or the answer was
 * a shape this build cannot read.
 *
 * A table rather than three string literals inside `createClient`, so the honesty sweep can drive
 * them. A sentence buried in a `catch` is a sentence no property ever looks at.
 */
export const CLIENT_FAILURES: Readonly<Record<'unreachable' | 'unexpected-response' | 'refused', string>> =
  Object.freeze({
    // Says the run survives, because the reading people assume — "my score is gone" — is both
    // wrong and the one that makes them stop playing.
    unreachable:
      'The leaderboard server could not be reached. Your run is not lost — it can be posted when ' +
      'the connection is back.',
    'unexpected-response':
      'The server answered in a shape this build does not understand. It may be a newer version.',
    // The fallback when a 4xx carried no `detail` of its own. Deliberately says nothing about why:
    // inventing a reason here would be a second place deciding what a refusal means.
    refused: 'The server refused that request.',
  });

/**
 * A {@link Transport} over the platform `fetch`.
 *
 * Separate from {@link createClient} so the client's tests never touch the network and this
 * adapter's own shortcomings — a body that is not JSON, a server that is unreachable — are handled
 * in one place instead of at each call site.
 */
export function fetchTransport(fetchLike: typeof fetch): Transport {
  return async (request) => {
    const response = await fetchLike(request.url, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        ...(request.token === undefined ? {} : { authorization: `Bearer ${request.token}` }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body is a real outcome — a proxy's HTML error page is the usual one — and it
      // must not surface as "undefined is not an object" three layers up.
      body = undefined;
    }
    return { status: response.status, body };
  };
}

/* -------------------------------------------------------------------------- *
 * The client
 * -------------------------------------------------------------------------- */

export interface LeaderboardClient {
  register(input: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<Result<{ token: string; user: AccountSummary }>>;
  login(input: { email: string; password: string }): Promise<Result<{ token: string; user: AccountSummary }>>;
  logout(token: string): Promise<Result<null>>;
  me(token: string): Promise<Result<AccountSummary>>;
  submit(
    token: string,
    submission: { run: RunSubmission; claimed: ClaimedMetrics },
  ): Promise<Result<{ configHash: string; entry: BoardEntry }>>;
  boards(): Promise<Result<readonly BoardSummary[]>>;
  board(configHash: string, metric: string): Promise<Result<BoardPage>>;
}

/**
 * Build a client against `origin`.
 *
 * `origin` is required and has no default. A client that fell back to the page's own origin would
 * silently work in development and silently fail in a build served from a CDN, which is the class
 * of bug that only reproduces where it cannot be debugged.
 */
export function createClient(origin: string, transport: Transport): LeaderboardClient {
  const base = origin.replace(/\/$/u, '');

  async function call<T>(request: TransportRequest, expect: (body: unknown) => T | undefined): Promise<Result<T>> {
    let response: TransportResponse;
    try {
      response = await transport(request);
    } catch {
      return { ok: false, code: 'unreachable', detail: CLIENT_FAILURES.unreachable, issues: [] };
    }
    const body = (response.body ?? {}) as Record<string, unknown>;
    if (response.status >= 400) {
      return {
        ok: false,
        code: typeof body['error'] === 'string' ? body['error'] : `http-${String(response.status)}`,
        // The server's own wording where there is one. It is written for a player and rewriting it
        // here would be a second place that decides what a rejection means.
        detail: typeof body['detail'] === 'string' ? body['detail'] : CLIENT_FAILURES.refused,
        issues: Array.isArray(body['issues']) ? (body['issues'] as string[]) : [],
      };
    }
    const value = expect(response.body);
    if (value === undefined) {
      // A 2xx whose shape is wrong is a server the client does not understand, and pretending
      // otherwise would put `undefined` on screen where a score should be.
      return {
        ok: false,
        code: 'unexpected-response',
        detail: CLIENT_FAILURES['unexpected-response'],
        issues: [],
      };
    }
    return { ok: true, value };
  }

  const session = (body: unknown): { token: string; user: AccountSummary } | undefined => {
    const record = body as Record<string, unknown> | null;
    const user = record?.['user'] as AccountSummary | undefined;
    return typeof record?.['token'] === 'string' && user !== undefined
      ? { token: record['token'], user }
      : undefined;
  };

  return {
    register: (input) =>
      call({ method: 'POST', url: `${base}/api/register`, token: undefined, body: input }, session),
    login: (input) => call({ method: 'POST', url: `${base}/api/login`, token: undefined, body: input }, session),
    logout: (token) => call({ method: 'POST', url: `${base}/api/logout`, token, body: {} }, () => null),
    me: (token) =>
      call({ method: 'GET', url: `${base}/api/me`, token, body: undefined }, (body) =>
        (body as Record<string, unknown> | null)?.['user'] as AccountSummary | undefined,
      ),
    submit: (token, submission) =>
      call({ method: 'POST', url: `${base}/api/scores`, token, body: submission }, (body) => {
        const record = body as Record<string, unknown> | null;
        return typeof record?.['configHash'] === 'string'
          ? { configHash: record['configHash'], entry: record['entry'] as BoardEntry }
          : undefined;
      }),
    boards: () =>
      call({ method: 'GET', url: `${base}/api/boards`, token: undefined, body: undefined }, (body) => {
        const boards = (body as Record<string, unknown> | null)?.['boards'];
        return Array.isArray(boards) ? (boards as BoardSummary[]) : undefined;
      }),
    board: (configHash, metric) =>
      call(
        {
          method: 'GET',
          url: `${base}/api/board?configHash=${encodeURIComponent(configHash)}&metric=${encodeURIComponent(metric)}`,
          token: undefined,
          body: undefined,
        },
        (body) => {
          const record = body as Record<string, unknown> | null;
          return Array.isArray(record?.['entries']) ? (record as unknown as BoardPage) : undefined;
        },
      ),
  };
}
