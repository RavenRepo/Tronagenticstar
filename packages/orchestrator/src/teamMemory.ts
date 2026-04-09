import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface MemoryEntry {
  id: string;
  path: string;
  content: string;
  checksum: string;
  lastModified: Date;
  source: "local" | "server";
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
}

export interface SecretScanResult {
  hasSecrets: boolean;
  detected: { label: string; pattern: string; match: string }[];
}

const SECRET_PATTERNS = [
  { label: "AWS Access Key ID", pattern: /AKIA[0-9A-Z]{16}/g },
  { label: "AWS Secret Access Key", pattern: /(?:aws_secret_access_key|aws_secret|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi },
  { label: "AWS Session Token", pattern: /aws_session_token\s*[:=]\s*["']?([A-Za-z0-9/+=]{100,})["']?/gi },
  { label: "GCP Service Account Key", pattern: /"type":\s*"service_account"/gi },
  { label: "GCP API Key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { label: "Azure Storage Key", pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]{44,}/gi },
  { label: "Azure SQL Password", pattern: /Password\s*=\s*[^;]{8,}/gi },
  { label: "Azure Client Secret", pattern: /client_secret\s*[:=]\s*["']?([A-Za-z0-9_~.-]{30,})["']?/gi },
  { label: "DigitalOcean Token", pattern: /doo_(?:live_|test_)?[0-9a-fA-F]{64}/g },
  { label: "Anthropic API Key", pattern: /sk-ant-[a-zA-Z0-9_-]{90,}/g },
  { label: "OpenAI API Key", pattern: /sk-[a-zA-Z0-9_-]{48,}/g },
  { label: "OpenAI Org Key", pattern: /org-[a-zA-Z0-9_-]{32,}/g },
  { label: "HuggingFace Token", pattern: /hf_[a-zA-Z0-9_-]{34,}/g },
  { label: "GitHub Personal Access Token", pattern: /ghp_[a-zA-Z0-9_-]{36}/g },
  { label: "GitHub Fine-grained PAT", pattern: /github_pat_[a-zA-Z0-9_-]{22}_[a-zA-Z0-9_-]{59}/g },
  { label: "GitHub OAuth Token", pattern: /gho_[a-zA-Z0-9_-]{36}/g },
  { label: "GitHub App Token", pattern: /(?:ghu|ghs)_[a-zA-Z0-9_-]{36}/g },
  { label: "GitHub Refresh Token", pattern: /ghr_[a-zA-Z0-9_-]{75,}/g },
  { label: "Slack Bot Token", pattern: /xoxb-[a-zA-Z0-9_-]{48,}/g },
  { label: "Slack User Token", pattern: /xoxp-[a-zA-Z0-9_-]{48,}/g },
  { label: "Slack Webhook URL", pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9]+\/B[a-zA-Z0-9]+\/[a-zA-Z0-9]+/g },
  { label: "Slack OAuth Token", pattern: /xox[basr]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]+/g },
  { label: "Twilio Account SID", pattern: /AC[a-z0-9]{32}/g },
  { label: "Twilio Auth Token", pattern: /[0-9a-zA-Z]{32}/g },
  { label: "Twilio API Key", pattern: /SK[a-z0-9]{32}/g },
  { label: "SendGrid API Key", pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g },
  { label: "NPM Token", pattern: /npm_[A-Za-z0-9]{36}/g },
  { label: "PyPI Token", pattern: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/g },
  { label: "Stripe Secret Key", pattern: /sk_live_[a-zA-Z0-9]{24,}/g },
  { label: "Stripe Publishable Key", pattern: /pk_live_[a-zA-Z0-9]{24,}/g },
  { label: "Stripe Webhook Secret", pattern: /whsec_[a-zA-Z0-9]{32}/g },
  { label: "Shopify Admin API Token", pattern: /shpat_[a-f0-9]{32}/g },
  { label: "Shopify Storefront Token", pattern: /shpat_[a-f0-9]{32}/g },
  { label: "Private Key PEM", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { label: "PEM Certificate", pattern: /-----BEGIN CERTIFICATE-----/g },
  { label: "Heroku API Key", pattern: /[hH]eroku[aA][pP][iI][kK][eEyY]\s*[:=]\s*["']?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}["']?/g },
  { label: "Discord Bot Token", pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g },
  { label: "Discord Webhook URL", pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g },
  { label: "Telegram Bot Token", pattern: /\d{8,10}:[A-Za-z0-9_-]{35}/g },
  { label: "Spotify Client Secret", pattern: /[a-f0-9]{32}/g },
  { label: "Dropbox API Token", pattern: /[A-Za-z0-9_-]{42}/g },
  { label: "Dropbox Refresh Token", pattern: /[A-Za-z0-9_-]{90,}/g },
  { label: "Mailgun API Key", pattern: /key-[0-9a-zA-Z]{32}/g },
  { label: "Mailchimp API Key", pattern: /[0-9a-f]{32}-us[0-9]{1,2}/g },
  { label: "Datadog API Key", pattern: /[a-z0-9]{32}/g },
  { label: "Snyk API Token", pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g },
  { label: "CircleCI Token", pattern: /[a-zA-Z0-9]{40}/g },
  { label: "npmrc Auth Token", pattern: /_auth\s*=\s*[A-Za-z0-9+/]+={0,2}/g },
  { label: "Docker Hub Token", pattern: /dockerhub_[a-f0-9]{60}/g },
  { label: "Atlassian API Token", pattern: /[A-Za-z0-9]{24}/g },
  { label: "Notion Integration Token", pattern: /secret_[a-zA-Z0-9_-]{43}/g },
  { label: "Supabase API Key", pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
];

export function scanForSecrets(content: string): SecretScanResult {
  const detected: { label: string; pattern: string; match: string }[] = [];
  const seenMatches = new Set<string>();

  for (const { label, pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const matchStr = match[0];
      const key = `${label}:${matchStr}`;
      if (!seenMatches.has(key)) {
        seenMatches.add(key);
        detected.push({
          label,
          pattern: pattern.source,
          match: matchStr.length > 50 ? matchStr.substring(0, 50) + "..." : matchStr,
        });
      }
    }
  }

  return {
    hasSecrets: detected.length > 0,
    detected,
  };
}

export function checkTeamMemSecrets(content: string): { allowed: boolean; reason?: string } {
  const result = scanForSecrets(content);

  if (result.hasSecrets) {
    const labels = result.detected.map((d) => d.label).join(", ");
    return {
      allowed: false,
      reason: `Blocked: Detected secrets (${labels}). Remove credentials before writing to team memory.`,
    };
  }

  return { allowed: true };
}

export class TeamMemoryService {
  private syncInterval: number;
  private serverUrl: string;
  private watchInterval: ReturnType<typeof setInterval> | null = null;
  private memoryDir: string;
  private localEntries: Map<string, MemoryEntry> = new Map();

  constructor(serverUrl: string = "http://localhost:3000", syncIntervalMs: number = 30000, memoryDir?: string) {
    this.serverUrl = serverUrl;
    this.syncInterval = syncIntervalMs;
    this.memoryDir = memoryDir || path.join(process.cwd(), ".team-memory");
  }

  async sync(teamId: string): Promise<SyncResult> {
    const errors: string[] = [];
    let pulled = 0;
    let pushed = 0;
    let conflicts = 0;

    try {
      await this.loadLocalEntries();
    } catch (e) {
      errors.push(`Failed to load local entries: ${e}`);
    }

    let serverEntries: MemoryEntry[] = [];
    try {
      serverEntries = await this.pull();
      pulled = serverEntries.length;
    } catch (e) {
      errors.push(`Failed to pull from server: ${e}`);
    }

    const localMap = new Map<string, MemoryEntry>();
    for (const entry of this.localEntries.values()) {
      localMap.set(entry.path, entry);
    }

    for (const serverEntry of serverEntries) {
      const localEntry = localMap.get(serverEntry.path);

      if (!localEntry) {
        this.localEntries.set(serverEntry.id, serverEntry);
        await this.writeEntryToFile(serverEntry);
      } else if (localEntry.checksum !== serverEntry.checksum) {
        conflicts++;
      }
    }

    const entriesToPush: MemoryEntry[] = [];
    for (const entry of this.localEntries.values()) {
      if (entry.source === "local") {
        const serverEntry = serverEntries.find((s) => s.path === entry.path);
        if (!serverEntry || serverEntry.checksum !== entry.checksum) {
          entriesToPush.push(entry);
        }
      }
    }

    if (entriesToPush.length > 0) {
      try {
        await this.push(entriesToPush);
        pushed = entriesToPush.length;
      } catch (e) {
        errors.push(`Failed to push to server: ${e}`);
      }
    }

    return { pulled, pushed, conflicts, errors };
  }

  async pull(): Promise<MemoryEntry[]> {
    const response = await fetch(`${this.serverUrl}/api/team-memory/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.entries || []).map((e: any) => ({
      ...e,
      lastModified: new Date(e.lastModified),
    }));
  }

  async push(entries: MemoryEntry[]): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/team-memory/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.status} ${response.statusText}`);
    }
  }

  startWatcher(): void {
    if (this.watchInterval) return;

    this.watchInterval = setInterval(async () => {
      try {
        await this.loadLocalEntries();
      } catch (e) {
        console.error("Team memory watcher error:", e);
      }
    }, this.syncInterval);
  }

  stopWatcher(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  private async loadLocalEntries(): Promise<void> {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
      return;
    }

    const files = this.walkDir(this.memoryDir);
    this.localEntries.clear();

    for (const file of files) {
      const relativePath = path.relative(this.memoryDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const stat = fs.statSync(file);
      const checksum = crypto.createHash("sha256").update(content).digest("hex");

      this.localEntries.set(relativePath, {
        id: relativePath,
        path: relativePath,
        content,
        checksum,
        lastModified: stat.mtime,
        source: "local",
      });
    }
  }

  private async writeEntryToFile(entry: MemoryEntry): Promise<void> {
    const fullPath = path.join(this.memoryDir, entry.path);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, entry.content, "utf-8");
  }

  private walkDir(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, files);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  getMemoryDir(): string {
    return this.memoryDir;
  }
}
