// ═══════════════════════════════════════════════════════════════════════════════
// OpenClaw Integration — Neo4j Cypher Migrations
// ═══════════════════════════════════════════════════════════════════════════════
//
// Run these mutations against your Neo4j instance (port 7474 / 7687) after
// deploying the Phase 1–3 code changes.
//
// Usage:
//   Option A — Neo4j Browser:  Paste each section individually at http://localhost:7474
//   Option B — cypher-shell:   cat scripts/openclaw-neo4j-migrations.cypher | cypher-shell -u neo4j -p <password>
//   Option C — Node.js driver: Load and execute via the neo4j-driver npm package
//
// These migrations are IDEMPOTENT — safe to run multiple times.
// ═══════════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────────────
// Phase 1f: Assign NATS subjects to ALL agents
// ─────────────────────────────────────────────────────────────────────────────
// Pattern: constella.agent.{agentId}
// Each agent gets three sub-subjects at runtime:
//   .inbox    — inbound messages to the agent
//   .response — agent responses (filtered by correlationId)
//   .status   — heartbeat / presence updates
//
// The base subject is stored on the node; the orchestrator appends
// .inbox / .response / .status programmatically via getNatsSubject().
// ─────────────────────────────────────────────────────────────────────────────

UNWIND [
  {id: 'api-gateway',       subject: 'constella.agent.api-gateway'},
  {id: 'orchestrator-py',   subject: 'constella.agent.orchestrator-py'},
  {id: 'codecraft',         subject: 'constella.agent.codecraft'},
  {id: 'errorgold-listener',subject: 'constella.agent.errorgold-listener'},
  {id: 'evaluator',         subject: 'constella.agent.evaluator'},
  {id: 'designforge',       subject: 'constella.agent.designforge'},
  {id: 'embedding',         subject: 'constella.agent.embedding'},
  {id: 'perfpulse',         subject: 'constella.agent.perfpulse'},
  {id: 'retriever',         subject: 'constella.agent.retriever'},
  {id: 'securishield',      subject: 'constella.agent.securishield'},
  {id: 'soc2-compliance',   subject: 'constella.agent.soc2-compliance'},
  {id: 'memory-guardian',   subject: 'constella.agent.memory-guardian'},
  {id: 'expressops',        subject: 'constella.agent.expressops'},
  {id: 'mobilefirstops',    subject: 'constella.agent.mobilefirstops'},
  {id: 'database-agent',    subject: 'constella.agent.database-agent'},
  {id: 'python-expert',     subject: 'constella.agent.python-expert'}
] AS row
MATCH (a:AIAgent {id: row.id})
SET a.nats_subject = row.subject,
    a.nats_inbox   = row.subject + '.inbox',
    a.nats_response = row.subject + '.response',
    a.nats_status  = row.subject + '.status',
    a.swarm_enabled = true,
    a.updated_at = datetime()
RETURN a.id AS agentId, a.nats_subject AS natsSubject;


// ─────────────────────────────────────────────────────────────────────────────
// Phase 2g: Set sandbox_policy on allowlisted agents
// ─────────────────────────────────────────────────────────────────────────────
// Only these agents are permitted to invoke the system_run tool:
//   - codecraft       — code generation and execution
//   - python-expert   — Python script execution
//   - expressops      — DevOps automation scripts
//   - database-agent  — database migration scripts
//
// All other agents default to sandbox_policy = 'denied' which is enforced
// at runtime by SystemTools. We set it explicitly on the graph for auditability.
// ─────────────────────────────────────────────────────────────────────────────

// Set allowed agents
UNWIND ['codecraft', 'python-expert', 'expressops', 'database-agent'] AS agentId
MATCH (a:AIAgent {id: agentId})
SET a.sandbox_policy = 'allowed',
    a.sandbox_variant = 'default',
    a.updated_at = datetime()
RETURN a.id AS agentId, a.sandbox_policy AS sandboxPolicy;

// Explicitly mark securishield with browser sandbox variant (for web scanning)
MATCH (a:AIAgent {id: 'securishield'})
SET a.sandbox_policy = 'allowed',
    a.sandbox_variant = 'browser',
    a.updated_at = datetime()
RETURN a.id AS agentId, a.sandbox_policy AS sandboxPolicy, a.sandbox_variant AS variant;

// Mark all other agents as denied (idempotent — only sets if not already set)
MATCH (a:AIAgent)
WHERE a.sandbox_policy IS NULL
SET a.sandbox_policy = 'denied',
    a.updated_at = datetime()
RETURN a.id AS agentId, a.sandbox_policy AS sandboxPolicy;


// ─────────────────────────────────────────────────────────────────────────────
// Phase 3h: Create Channel connector nodes
// ─────────────────────────────────────────────────────────────────────────────
// Channel nodes represent external chat platform integrations.
// Each Channel node CONNECTS_TO the api-gateway agent, which is responsible
// for routing inbound messages to the correct Constella agent.
//
// Status values:
//   - pending_configuration  — env vars not yet set
//   - active                 — fully configured and operational
//   - disabled               — intentionally turned off
// ─────────────────────────────────────────────────────────────────────────────

// Create Slack channel connector node (idempotent via MERGE)
MERGE (slack:Channel {id: 'slack-connector'})
ON CREATE SET
  slack.type = 'slack',
  slack.display_name = 'Slack Integration',
  slack.webhook_path = '/webhooks/slack/events',
  slack.status = 'pending_configuration',
  slack.supported_events = ['app_mention', 'message.im'],
  slack.verification_method = 'hmac-sha256',
  slack.default_agent = 'orchestrator-py',
  slack.created_at = datetime(),
  slack.updated_at = datetime()
ON MATCH SET
  slack.webhook_path = '/webhooks/slack/events',
  slack.supported_events = ['app_mention', 'message.im'],
  slack.verification_method = 'hmac-sha256',
  slack.updated_at = datetime()
RETURN slack.id AS channelId, slack.status AS status;

// Create Discord channel connector node (idempotent via MERGE)
MERGE (discord:Channel {id: 'discord-connector'})
ON CREATE SET
  discord.type = 'discord',
  discord.display_name = 'Discord Integration',
  discord.webhook_path = '/webhooks/discord/events',
  discord.status = 'pending_configuration',
  discord.supported_events = ['APPLICATION_COMMAND', 'MESSAGE_COMPONENT', 'PING'],
  discord.verification_method = 'ed25519',
  discord.default_agent = 'orchestrator-py',
  discord.created_at = datetime(),
  discord.updated_at = datetime()
ON MATCH SET
  discord.webhook_path = '/webhooks/discord/events',
  discord.supported_events = ['APPLICATION_COMMAND', 'MESSAGE_COMPONENT', 'PING'],
  discord.verification_method = 'ed25519',
  discord.updated_at = datetime()
RETURN discord.id AS channelId, discord.status AS status;

// Create CONNECTS_TO relationships between channels and the API gateway
// (idempotent — MERGE prevents duplicate relationships)
MATCH (slack:Channel {id: 'slack-connector'})
MATCH (gw:AIAgent {id: 'api-gateway'})
MERGE (slack)-[:CONNECTS_TO]->(gw)
RETURN slack.id AS channel, gw.id AS gateway;

MATCH (discord:Channel {id: 'discord-connector'})
MATCH (gw:AIAgent {id: 'api-gateway'})
MERGE (discord)-[:CONNECTS_TO]->(gw)
RETURN discord.id AS channel, gw.id AS gateway;

// Create ROUTES_TO relationships: channels can route to any swarm-enabled agent
// This creates a graph edge showing which agents are reachable from each channel
MATCH (ch:Channel)
MATCH (a:AIAgent)
WHERE a.swarm_enabled = true AND a.id <> 'api-gateway'
MERGE (ch)-[:CAN_ROUTE_TO]->(a)
RETURN ch.id AS channel, collect(a.id) AS reachableAgents;


// ─────────────────────────────────────────────────────────────────────────────
// Verification queries — run these to confirm the migrations worked
// ─────────────────────────────────────────────────────────────────────────────

// Verify NATS subjects assigned
// MATCH (a:AIAgent) WHERE a.nats_subject IS NOT NULL
// RETURN a.id, a.nats_subject, a.swarm_enabled
// ORDER BY a.id;

// Verify sandbox policies
// MATCH (a:AIAgent)
// RETURN a.id, a.sandbox_policy, a.sandbox_variant
// ORDER BY a.sandbox_policy DESC, a.id;

// Verify channel nodes and relationships
// MATCH (ch:Channel)-[r]->(target)
// RETURN ch.id, ch.type, ch.status, type(r) AS relationship, target.id AS target_id
// ORDER BY ch.id, type(r), target.id;

// Full integration overview
// MATCH (a:AIAgent)
// OPTIONAL MATCH (ch:Channel)-[:CAN_ROUTE_TO]->(a)
// RETURN a.id AS agent,
//        a.nats_subject AS nats,
//        a.sandbox_policy AS sandbox,
//        a.swarm_enabled AS swarm,
//        collect(DISTINCT ch.type) AS reachable_from_channels
// ORDER BY a.id;
