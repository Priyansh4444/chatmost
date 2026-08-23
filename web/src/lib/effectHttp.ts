import { Data, Effect, Schedule } from "effect";

class RetryableHttpError extends Data.TaggedError("RetryableHttpError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

class FatalHttpError extends Data.TaggedError("FatalHttpError")<{
  readonly message: string;
}> {}

class CancelledHttpError extends Data.TaggedError("CancelledHttpError")<{
  readonly message: "cancelled";
}> {}

class HttpDecodeError extends Data.TaggedError("HttpDecodeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

type HttpRequestFailure = RetryableHttpError | FatalHttpError | CancelledHttpError;
type HttpFailure = HttpRequestFailure | HttpDecodeError;

interface RetryPolicy {
  readonly retries?: number;
  readonly baseBackoffMs?: number;
  readonly jitterMs?: number;
}

export function fetchWithRetryEffect(
  url: string,
  options: RequestInit = {},
  isCancelled: () => boolean = () => false,
  policy: RetryPolicy = {}
): Effect.Effect<Response, HttpRequestFailure> {
  const retries = policy.retries ?? 3;
  const baseBackoffMs = policy.baseBackoffMs ?? 100;
  const jitterMs = policy.jitterMs ?? 250;

  const attempt: Effect.Effect<Response, HttpRequestFailure> = Effect.suspend((): Effect.Effect<Response, HttpRequestFailure> => {
    if (isCancelled()) return Effect.fail(new CancelledHttpError({ message: "cancelled" }));

    return Effect.tryPromise({
      try: () => fetch(url, options),
      catch: (cause) => new RetryableHttpError({
        message: cause instanceof Error ? cause.message : "Fetch failed",
        cause,
      }),
    }).pipe(
      Effect.flatMap((response): Effect.Effect<Response, HttpRequestFailure> => {
        if (response.ok) return Effect.succeed(response);
        const message = `HTTP ${response.status}`;
        return response.status !== 429 && response.status >= 400 && response.status < 500
          ? Effect.fail(new FatalHttpError({ message }))
          : Effect.fail(new RetryableHttpError({ message }));
      })
    );
  });

  const retrySchedule: Schedule.Schedule<number, HttpRequestFailure> = Schedule.recurs(retries).pipe(
    Schedule.addDelay((retryIndex) => baseBackoffMs * 2 ** retryIndex + Math.random() * jitterMs),
    Schedule.whileInput((error) => error._tag === "RetryableHttpError")
  );

  return attempt.pipe(Effect.retry(retrySchedule));
}

export function fetchJsonWithRetryEffect<A = unknown>(
  url: string,
  options: RequestInit = {},
  isCancelled: () => boolean = () => false,
  policy: RetryPolicy = {}
): Effect.Effect<A, HttpFailure> {
  return fetchWithRetryEffect(url, options, isCancelled, policy).pipe(
    Effect.flatMap((response) => Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: (cause) => new HttpDecodeError({ message: "Invalid JSON response", cause }),
    }))
  );
}

export function fetchTextWithRetryEffect(
  url: string,
  options: RequestInit = {},
  isCancelled: () => boolean = () => false,
  policy: RetryPolicy = {}
): Effect.Effect<string, HttpFailure> {
  return fetchWithRetryEffect(url, options, isCancelled, policy).pipe(
    Effect.flatMap((response) => Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new HttpDecodeError({ message: "Invalid text response", cause }),
    }))
  );
}
