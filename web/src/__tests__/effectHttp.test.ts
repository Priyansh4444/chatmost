import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { fetchWithRetryEffect } from "../lib/effectHttp";
import { fetchEmoteSets } from "../lib/emoteSets";

describe("Effect HTTP boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails as cancelled before starting a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await Effect.runPromise(Effect.flip(
      fetchWithRetryEffect("https://example.test", {}, () => true)
    ));

    expect(error._tag).toBe("CancelledHttpError");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps valid emote sources when another source fails or returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("7tv.io")) {
        return Response.json({ emote_set: { emotes: [{ id: "abc", name: "Wave" }] } });
      }
      if (url.includes("betterttv.net")) return new Response("missing", { status: 404 });
      return new Response("not json", { status: 200 });
    }));

    const sets = await fetchEmoteSets("123");

    expect(sets["7tv"].get("Wave")).toBe("https://cdn.7tv.app/emote/abc/2x.webp");
    expect(sets.bttv.size).toBe(0);
    expect(sets.ffz.size).toBe(0);
  });
});
