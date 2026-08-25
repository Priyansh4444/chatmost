import { describe, it, expect } from "vitest";
import { parseTwitchVote, getChoiceSubTokens, type ActiveChoice } from "../lib/twitchChat";

describe("Twitch Chat Voting & Sub-token / Alias Matching", () => {
  const choices: ActiveChoice[] = [
    { login: "exampleviewer", displayName: "ExampleViewer" },
    { login: "chat_member", displayName: "chat_member" },
    { login: "participant123", displayName: "participant123" },
    { login: "trailing_", displayName: "trailing_" },
  ];

  it("extracts sub-tokens for compound and camelCase names", () => {
    const camelTokens = getChoiceSubTokens(choices[0]);
    expect(camelTokens).toContain("example");
    expect(camelTokens).toContain("viewer");

    const underscoreTokens = getChoiceSubTokens(choices[1]);
    expect(underscoreTokens).toContain("chat");
    expect(underscoreTokens).toContain("member");

    const numberedTokens = getChoiceSubTokens(choices[2]);
    expect(numberedTokens).toContain("participant");

    const trailingTokens = getChoiceSubTokens(choices[3]);
    expect(trailingTokens).toContain("trailing");
  });

  it("matches option indices from direct numbers and letters", () => {
    expect(parseTwitchVote("1", choices)?.index).toBe(0);
    expect(parseTwitchVote("A", choices)?.index).toBe(0);
    expect(parseTwitchVote("!2", choices)?.index).toBe(1);
    expect(parseTwitchVote("b", choices)?.index).toBe(1);
    expect(parseTwitchVote("vote 3", choices)?.index).toBe(2);
    expect(parseTwitchVote("C", choices)?.index).toBe(2);
    expect(parseTwitchVote("4", choices)?.index).toBe(3);
    expect(parseTwitchVote("d", choices)?.index).toBe(3);
  });

  it("matches a camelCase name component and identifies matchedToken", () => {
    const res1 = parseTwitchVote("example", choices);
    expect(res1).not.toBeNull();
    expect(res1?.index).toBe(0);
    expect(res1?.name).toBe("ExampleViewer");
    expect(res1?.matchedToken).toBe("example");

    const res2 = parseTwitchVote("I think example did this", choices);
    expect(res2?.index).toBe(0);
    expect(res2?.name).toBe("ExampleViewer");
    expect(res2?.matchedToken).toBe("example");
  });

  it("matches a component of an underscored login", () => {
    const res = parseTwitchVote("member", choices);
    expect(res).not.toBeNull();
    expect(res?.index).toBe(1);
    expect(res?.name).toBe("chat_member");
    expect(res?.matchedToken).toBe("member");

    const resSentence = parseTwitchVote("definitely member for sure", choices);
    expect(resSentence?.index).toBe(1);
    expect(resSentence?.matchedToken).toBe("member");
  });

  it("matches a login with trailing digits by its stem", () => {
    const res = parseTwitchVote("participant", choices);
    expect(res).not.toBeNull();
    expect(res?.index).toBe(2);
    expect(res?.name).toBe("participant123");
    expect(res?.matchedToken).toBe("participant");
  });

  it("matches a login without trailing punctuation", () => {
    const res = parseTwitchVote("trailing", choices);
    expect(res).not.toBeNull();
    expect(res?.index).toBe(3);
    expect(res?.name).toBe("trailing_");
    expect(res?.matchedToken).toBe("trailing");
  });

  it("matches an emote name", () => {
    const emoteChoices: ActiveChoice[] = [
      { login: "emote_a", displayName: "EMOTE_A" },
      { login: "emote_b", displayName: "EMOTE_B" },
    ];
    const res = parseTwitchVote("emote_a", emoteChoices);
    expect(res?.index).toBe(0);
    expect(res?.name).toBe("EMOTE_A");
    expect(res?.matchedToken).toBe("emote_a");
  });

  it("handles Higher or Lower mode keywords properly", () => {
    const hlChoices: ActiveChoice[] = [
      { login: "higher", displayName: "Higher" },
      { login: "lower", displayName: "Lower" },
    ];

    expect(parseTwitchVote("higher", hlChoices)?.index).toBe(0);
    expect(parseTwitchVote("up", hlChoices)?.index).toBe(0);
    expect(parseTwitchVote("more", hlChoices)?.index).toBe(0);

    expect(parseTwitchVote("lower", hlChoices)?.index).toBe(1);
    expect(parseTwitchVote("down", hlChoices)?.index).toBe(1);
    expect(parseTwitchVote("less", hlChoices)?.index).toBe(1);
    expect(parseTwitchVote("fewer", hlChoices)?.index).toBe(1);
  });

  it("does not treat single letters or negation as Higher/Lower votes", () => {
    const hlChoices: ActiveChoice[] = [
      { login: "higher", displayName: "Higher" },
      { login: "lower", displayName: "Lower" },
    ];

    // Single-letter shortcuts collide with emote spam ("s", "o", "h", ...).
    expect(parseTwitchVote("s", hlChoices)).toBeNull();
    expect(parseTwitchVote("h", hlChoices)).toBeNull();
    expect(parseTwitchVote("l", hlChoices)).toBeNull();
    expect(parseTwitchVote("w", hlChoices)).toBeNull();
    expect(parseTwitchVote("+", hlChoices)).toBeNull();
    expect(parseTwitchVote("-", hlChoices)).toBeNull();

    // Negation flips the vote: "s is not LOWER???" -> HIGHER.
    expect(parseTwitchVote("s is not LOWER???", hlChoices)?.index).toBe(0);
    expect(parseTwitchVote("that's not higher", hlChoices)?.index).toBe(1);
    expect(parseTwitchVote("no, lower is wrong", hlChoices)?.index).toBe(0);
  });

  it("handles successive question rounds when choices update", () => {
    const round1Choices: ActiveChoice[] = [
      { login: "alice", displayName: "Alice" },
      { login: "bob", displayName: "Bob" },
      { login: "charlie", displayName: "Charlie" },
      { login: "dave", displayName: "Dave" },
    ];

    expect(parseTwitchVote("1", round1Choices)?.name).toBe("Alice");
    expect(parseTwitchVote("bob", round1Choices)?.name).toBe("Bob");

    // Next round with different choices
    const round2Choices: ActiveChoice[] = [
      { login: "eve", displayName: "Eve" },
      { login: "frank", displayName: "Frank" },
      { login: "grace", displayName: "Grace" },
      { login: "heidi", displayName: "Heidi" },
    ];

    expect(parseTwitchVote("1", round2Choices)?.name).toBe("Eve");
    expect(parseTwitchVote("frank", round2Choices)?.name).toBe("Frank");
    // Old round choice name shouldn't match
    expect(parseTwitchVote("bob", round2Choices)).toBeNull();
  });
});
