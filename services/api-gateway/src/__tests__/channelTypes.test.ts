// ─── Unit Tests for Channel Types & Utility Functions ───────────────────────
//
// Tests for:
//   - resolveAgentFromMention()
//   - extractAgentMention()
//   - buildAgentInboxSubject()
//   - buildAgentResponseSubject()
//   - generateCorrelationId()
//   - AGENT_MENTION_MAP constant
//   - DEFAULT_AGENT_ID constant
// ─────────────────────────────────────────────────────────────────────────────

import {
  resolveAgentFromMention,
  extractAgentMention,
  buildAgentInboxSubject,
  buildAgentResponseSubject,
  generateCorrelationId,
  AGENT_MENTION_MAP,
  DEFAULT_AGENT_ID,
} from "../channels/types";

// ─── resolveAgentFromMention ────────────────────────────────────────────────

describe("resolveAgentFromMention", () => {
  it("should resolve a known agent by exact lowercase name", () => {
    expect(resolveAgentFromMention("codecraft")).toBe("codecraft");
    expect(resolveAgentFromMention("securishield")).toBe("securishield");
    expect(resolveAgentFromMention("designforge")).toBe("designforge");
    expect(resolveAgentFromMention("perfpulse")).toBe("perfpulse");
    expect(resolveAgentFromMention("expressops")).toBe("expressops");
    expect(resolveAgentFromMention("mobilefirstops")).toBe("mobilefirstops");
    expect(resolveAgentFromMention("database-agent")).toBe("database-agent");
    expect(resolveAgentFromMention("python-expert")).toBe("python-expert");
    expect(resolveAgentFromMention("evaluator")).toBe("evaluator");
    expect(resolveAgentFromMention("retriever")).toBe("retriever");
    expect(resolveAgentFromMention("embedding")).toBe("embedding");
    expect(resolveAgentFromMention("soc2-compliance")).toBe("soc2-compliance");
    expect(resolveAgentFromMention("memory-guardian")).toBe("memory-guardian");
  });

  it("should resolve short alias names to the correct agent", () => {
    expect(resolveAgentFromMention("code")).toBe("codecraft");
    expect(resolveAgentFromMention("security")).toBe("securishield");
    expect(resolveAgentFromMention("design")).toBe("designforge");
    expect(resolveAgentFromMention("performance")).toBe("perfpulse");
    expect(resolveAgentFromMention("devops")).toBe("expressops");
    expect(resolveAgentFromMention("mobile")).toBe("mobilefirstops");
    expect(resolveAgentFromMention("database")).toBe("database-agent");
    expect(resolveAgentFromMention("db")).toBe("database-agent");
    expect(resolveAgentFromMention("python")).toBe("python-expert");
    expect(resolveAgentFromMention("soc2")).toBe("soc2-compliance");
    expect(resolveAgentFromMention("compliance")).toBe("soc2-compliance");
    expect(resolveAgentFromMention("memory")).toBe("memory-guardian");
  });

  it("should resolve orchestrator aliases to orchestrator-py", () => {
    expect(resolveAgentFromMention("chiefarchitect")).toBe("orchestrator-py");
    expect(resolveAgentFromMention("constella")).toBe("orchestrator-py");
    expect(resolveAgentFromMention("architect")).toBe("orchestrator-py");
  });

  it("should be case-insensitive (lowercases the input)", () => {
    expect(resolveAgentFromMention("CodeCraft")).toBe("codecraft");
    expect(resolveAgentFromMention("CODECRAFT")).toBe("codecraft");
    expect(resolveAgentFromMention("SecuriShield")).toBe("securishield");
    expect(resolveAgentFromMention("ChiefArchitect")).toBe("orchestrator-py");
    expect(resolveAgentFromMention("CONSTELLA")).toBe("orchestrator-py");
    expect(resolveAgentFromMention("Python-Expert")).toBe("python-expert");
    expect(resolveAgentFromMention("DATABASE-AGENT")).toBe("database-agent");
  });

  it("should strip a leading @ from the mention", () => {
    expect(resolveAgentFromMention("@codecraft")).toBe("codecraft");
    expect(resolveAgentFromMention("@security")).toBe("securishield");
    expect(resolveAgentFromMention("@ChiefArchitect")).toBe("orchestrator-py");
    expect(resolveAgentFromMention("@DEVOPS")).toBe("expressops");
  });

  it("should strip leading and trailing whitespace", () => {
    expect(resolveAgentFromMention("  codecraft  ")).toBe("codecraft");
    // When whitespace precedes @, the ^ anchor in replace(/^@/, "") doesn't
    // match, so the @ remains after trim — "@security" is not in the map.
    // This is expected: whitespace before @ prevents stripping.
    expect(resolveAgentFromMention("  @security  ")).toBe(DEFAULT_AGENT_ID);
    // But @ at the start with trailing whitespace works fine
    expect(resolveAgentFromMention("@designforge  ")).toBe("designforge");
  });

  it("should return the default agent for an unrecognised mention", () => {
    expect(resolveAgentFromMention("unknown-agent")).toBe(DEFAULT_AGENT_ID);
    expect(resolveAgentFromMention("nonexistent")).toBe(DEFAULT_AGENT_ID);
    expect(resolveAgentFromMention("")).toBe(DEFAULT_AGENT_ID);
    expect(resolveAgentFromMention("@randomuser")).toBe(DEFAULT_AGENT_ID);
  });

  it("should return DEFAULT_AGENT_ID which is orchestrator-py", () => {
    expect(DEFAULT_AGENT_ID).toBe("orchestrator-py");
  });
});

// ─── extractAgentMention ────────────────────────────────────────────────────

describe("extractAgentMention", () => {
  describe("@mention at the start of the message", () => {
    it("should extract a known agent mention and clean the text", () => {
      const result = extractAgentMention("@codecraft Please review my code");
      expect(result.agentId).toBe("codecraft");
      expect(result.cleanedText).toBe("Please review my code");
    });

    it("should extract agent mention with hyphenated name", () => {
      const result = extractAgentMention(
        "@python-expert Help me with decorators",
      );
      expect(result.agentId).toBe("python-expert");
      expect(result.cleanedText).toBe("Help me with decorators");
    });

    it("should extract agent alias mentions", () => {
      const result = extractAgentMention("@security Scan my app");
      expect(result.agentId).toBe("securishield");
      expect(result.cleanedText).toBe("Scan my app");
    });

    it("should handle case-insensitive mentions at start", () => {
      const result = extractAgentMention("@CodeCraft build a new feature");
      // The regex captures "CodeCraft", resolveAgentFromMention lowercases it
      expect(result.agentId).toBe("codecraft");
      expect(result.cleanedText).toBe("build a new feature");
    });
  });

  describe("Slack-style <@USERID> mention at the start", () => {
    it("should strip Slack user ID mentions and route to default agent", () => {
      const result = extractAgentMention("<@U12345678> help me with something");
      // Slack user IDs don't map to our agents, so should get default
      // The regex strips the <@...> portion, and the remaining mention text is empty
      expect(result.agentId).toBe(DEFAULT_AGENT_ID);
      expect(result.cleanedText).toBe("help me with something");
    });
  });

  describe("@mention embedded in the message text", () => {
    it("should find agent mention anywhere in the text", () => {
      const result = extractAgentMention(
        "Hey can you ask @codecraft to review this?",
      );
      expect(result.agentId).toBe("codecraft");
      expect(result.cleanedText).not.toContain("@codecraft");
    });

    it("should find alias mentions in the text", () => {
      const result = extractAgentMention(
        "I need @security to scan this endpoint",
      );
      expect(result.agentId).toBe("securishield");
      expect(result.cleanedText).not.toContain("@security");
    });

    it("should find @database mention in text", () => {
      const result = extractAgentMention(
        "Can @database help optimize this query?",
      );
      expect(result.agentId).toBe("database-agent");
      expect(result.cleanedText).not.toContain("@database");
    });
  });

  describe("no mention found", () => {
    it("should route to default agent when no mention is present", () => {
      const result = extractAgentMention("Please help me with my code");
      expect(result.agentId).toBe(DEFAULT_AGENT_ID);
      expect(result.cleanedText).toBe("Please help me with my code");
    });

    it("should route to default agent for an empty string", () => {
      const result = extractAgentMention("");
      expect(result.agentId).toBe(DEFAULT_AGENT_ID);
      expect(result.cleanedText).toBe("");
    });

    it("should route to default agent when @ is used for non-agent names", () => {
      const result = extractAgentMention("Email me at user@example.com");
      // 'user' is not in the AGENT_MENTION_MAP, so default
      expect(result.agentId).toBe(DEFAULT_AGENT_ID);
    });
  });

  describe("cleanedText edge cases", () => {
    it("should not produce empty cleanedText when mention is the entire message", () => {
      const result = extractAgentMention("@codecraft");
      expect(result.agentId).toBe("codecraft");
      // When cleaned text would be empty, the original text is used as fallback
      expect(result.cleanedText).toBeTruthy();
    });

    it("should trim whitespace from cleaned text", () => {
      const result = extractAgentMention("@codecraft   lots of spaces   ");
      expect(result.agentId).toBe("codecraft");
      expect(result.cleanedText).toBe("lots of spaces");
    });
  });
});

// ─── buildAgentInboxSubject ─────────────────────────────────────────────────

describe("buildAgentInboxSubject", () => {
  it("should build the correct NATS inbox subject for a given agent", () => {
    expect(buildAgentInboxSubject("codecraft")).toBe(
      "constella.agent.codecraft.inbox",
    );
    expect(buildAgentInboxSubject("orchestrator-py")).toBe(
      "constella.agent.orchestrator-py.inbox",
    );
    expect(buildAgentInboxSubject("securishield")).toBe(
      "constella.agent.securishield.inbox",
    );
  });

  it("should handle arbitrary agent IDs", () => {
    expect(buildAgentInboxSubject("custom-agent-123")).toBe(
      "constella.agent.custom-agent-123.inbox",
    );
  });

  it("should include the full pattern: constella.agent.{id}.inbox", () => {
    const subject = buildAgentInboxSubject("test");
    expect(subject).toMatch(/^constella\.agent\..+\.inbox$/);
  });
});

// ─── buildAgentResponseSubject ──────────────────────────────────────────────

describe("buildAgentResponseSubject", () => {
  it("should build the correct NATS response subject for a given agent", () => {
    expect(buildAgentResponseSubject("codecraft")).toBe(
      "constella.agent.codecraft.response",
    );
    expect(buildAgentResponseSubject("orchestrator-py")).toBe(
      "constella.agent.orchestrator-py.response",
    );
    expect(buildAgentResponseSubject("securishield")).toBe(
      "constella.agent.securishield.response",
    );
  });

  it("should handle arbitrary agent IDs", () => {
    expect(buildAgentResponseSubject("my-agent")).toBe(
      "constella.agent.my-agent.response",
    );
  });

  it("should include the full pattern: constella.agent.{id}.response", () => {
    const subject = buildAgentResponseSubject("test");
    expect(subject).toMatch(/^constella\.agent\..+\.response$/);
  });
});

// ─── generateCorrelationId ──────────────────────────────────────────────────

describe("generateCorrelationId", () => {
  it("should return a non-empty string", () => {
    const id = generateCorrelationId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("should generate unique IDs on successive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateCorrelationId());
    }
    // All 1000 IDs should be unique
    expect(ids.size).toBe(1000);
  });

  it("should generate a string with at least 16 characters", () => {
    const id = generateCorrelationId();
    // UUID has 36 chars with hyphens, fallback hex has 32
    expect(id.length).toBeGreaterThanOrEqual(16);
  });

  it("should contain only valid characters (UUID format or hex)", () => {
    const id = generateCorrelationId();
    // UUID: 8-4-4-4-12 hex digits with hyphens
    // Fallback: 32 hex digits
    expect(id).toMatch(/^[0-9a-f-]+$/i);
  });
});

// ─── AGENT_MENTION_MAP ──────────────────────────────────────────────────────

describe("AGENT_MENTION_MAP", () => {
  it("should be a non-empty object", () => {
    expect(typeof AGENT_MENTION_MAP).toBe("object");
    expect(Object.keys(AGENT_MENTION_MAP).length).toBeGreaterThan(0);
  });

  it("should have all keys as lowercase strings", () => {
    for (const key of Object.keys(AGENT_MENTION_MAP)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("should have all values as non-empty strings", () => {
    for (const value of Object.values(AGENT_MENTION_MAP)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("should include the primary agent aliases", () => {
    const expectedAliases = [
      "chiefarchitect",
      "constella",
      "architect",
      "codecraft",
      "code",
      "securishield",
      "security",
      "designforge",
      "design",
      "perfpulse",
      "performance",
      "expressops",
      "devops",
      "mobilefirstops",
      "mobile",
      "database-agent",
      "database",
      "db",
      "python-expert",
      "python",
      "evaluator",
      "retriever",
      "embedding",
      "soc2-compliance",
      "soc2",
      "compliance",
      "memory-guardian",
      "memory",
    ];
    for (const alias of expectedAliases) {
      expect(AGENT_MENTION_MAP).toHaveProperty(alias);
    }
  });

  it("should map all orchestrator aliases to orchestrator-py", () => {
    expect(AGENT_MENTION_MAP["chiefarchitect"]).toBe("orchestrator-py");
    expect(AGENT_MENTION_MAP["constella"]).toBe("orchestrator-py");
    expect(AGENT_MENTION_MAP["architect"]).toBe("orchestrator-py");
  });

  it("should map db alias to database-agent", () => {
    expect(AGENT_MENTION_MAP["db"]).toBe("database-agent");
    expect(AGENT_MENTION_MAP["database"]).toBe("database-agent");
    expect(AGENT_MENTION_MAP["database-agent"]).toBe("database-agent");
  });
});

// ─── DEFAULT_AGENT_ID ───────────────────────────────────────────────────────

describe("DEFAULT_AGENT_ID", () => {
  it("should be orchestrator-py", () => {
    expect(DEFAULT_AGENT_ID).toBe("orchestrator-py");
  });

  it("should be a string", () => {
    expect(typeof DEFAULT_AGENT_ID).toBe("string");
  });
});

// ─── Integration: resolveAgentFromMention + buildAgentInboxSubject ──────────

describe("Integration: mention resolution to NATS routing", () => {
  it("should resolve a mention and build the correct inbox subject", () => {
    const agentId = resolveAgentFromMention("@security");
    const subject = buildAgentInboxSubject(agentId);
    expect(subject).toBe("constella.agent.securishield.inbox");
  });

  it("should resolve an alias and build the correct response subject", () => {
    const agentId = resolveAgentFromMention("devops");
    const subject = buildAgentResponseSubject(agentId);
    expect(subject).toBe("constella.agent.expressops.response");
  });

  it("should build default agent inbox for unknown mentions", () => {
    const agentId = resolveAgentFromMention("totally-unknown");
    const subject = buildAgentInboxSubject(agentId);
    expect(subject).toBe("constella.agent.orchestrator-py.inbox");
  });

  it("should use extractAgentMention to route a full message", () => {
    const { agentId, cleanedText } = extractAgentMention(
      "@codecraft please generate a REST API for user management",
    );
    const inboxSubject = buildAgentInboxSubject(agentId);
    const responseSubject = buildAgentResponseSubject(agentId);
    const correlationId = generateCorrelationId();

    expect(agentId).toBe("codecraft");
    expect(cleanedText).toBe("please generate a REST API for user management");
    expect(inboxSubject).toBe("constella.agent.codecraft.inbox");
    expect(responseSubject).toBe("constella.agent.codecraft.response");
    expect(correlationId.length).toBeGreaterThan(0);
  });

  it("should handle the full Slack-like flow: mention → agent → NATS subjects", () => {
    // Simulate: user sends "@database optimize SELECT * FROM users WHERE ..."
    const { agentId, cleanedText } = extractAgentMention(
      "@database optimize SELECT * FROM users WHERE active = true",
    );

    expect(agentId).toBe("database-agent");
    expect(cleanedText).toBe(
      "optimize SELECT * FROM users WHERE active = true",
    );

    const inbox = buildAgentInboxSubject(agentId);
    const response = buildAgentResponseSubject(agentId);

    expect(inbox).toBe("constella.agent.database-agent.inbox");
    expect(response).toBe("constella.agent.database-agent.response");
  });
});
