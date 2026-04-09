import { readFile, stat, readdir } from "fs/promises";
import { join, basename } from "path";
import { existsSync, watch } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitStatus {
  branch: string;
  isRepo: boolean;
  hasUncommitted: boolean;
  hasUnstaged: boolean;
  hasUntracked: boolean;
  remoteUrl: string | null;
  lastCommitDate: Date | null;
}

export interface ClaudeMdSection {
  heading: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface ClaudeMdContent {
  location: string;
  content: string;
  sections: ClaudeMdSection[];
}

export interface ClaudeDirContent {
  location: string;
  files: { name: string; content: string }[];
}

export interface FileListing {
  root: string;
  files: string[];
  directories: string[];
}

export interface SystemContext {
  cwd: string;
  gitStatus: GitStatus | null;
  claudeMd: ClaudeMdContent | null;
  claudeDir: ClaudeDirContent | null;
  env: Record<string, string>;
  files: FileListing;
}

export interface UserContext {
  sessionId: string;
  history: { role: string; content: string; timestamp: Date }[];
}

type CacheState<T> = undefined | null | T;

function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

export class ContextManager {
  private memoizedGitStatus: Map<string, CacheState<GitStatus>> = new Map();
  private claudeMdCache: Map<string, CacheState<ClaudeMdContent>> = new Map();
  private projectContextCache: Map<string, CacheState<SystemContext>> = new Map();
  private watchers: Map<string, ReturnType<typeof watch>> = new Map();
  private debouncedInvalidate: Map<string, () => void> = new Map();

  async getSystemContext(cwd: string): Promise<SystemContext> {
    const cached = this.projectContextCache.get(cwd);
    if (cached !== undefined) {
      return cached as SystemContext;
    }

    const [gitStatus, claudeMd, claudeDir, files, env] = await Promise.all([
      this.getGitStatus(cwd),
      this.loadClaudeMd(cwd),
      this.loadClaudeDir(cwd),
      this.listFiles(cwd),
      this.getEnvVars(),
    ]);

    const context: SystemContext = {
      cwd,
      gitStatus,
      claudeMd,
      claudeDir,
      env,
      files,
    };

    this.projectContextCache.set(cwd, context);
    this.setupFileWatcher(cwd);
    return context;
  }

  async getUserContext(sessionId: string): Promise<UserContext> {
    return {
      sessionId,
      history: [],
    };
  }

  private async getGitStatus(cwd: string): Promise<GitStatus | null> {
    const cached = this.memoizedGitStatus.get(cwd);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const isRepo = await this.isGitRepo(cwd);
      if (!isRepo) {
        this.memoizedGitStatus.set(cwd, null);
        return null;
      }

      const [branch, statusOutput, remoteUrl, lastCommit] = await Promise.all([
        this.getGitBranch(cwd),
        this.getGitStatusOutput(cwd),
        this.getGitRemoteUrl(cwd),
        this.getLastCommitDate(cwd),
      ]);

      const status = statusOutput || "";
      const gitStatus: GitStatus = {
        branch,
        isRepo: true,
        hasUncommitted: status.includes("Changes to be committed") || status.includes("modified:"),
        hasUnstaged: status.includes("Changes not staged for commit") || status.includes("not staged"),
        hasUntracked: status.includes("Untracked files") || status.includes("Untracked files:"),
        remoteUrl,
        lastCommitDate: lastCommit,
      };

      this.memoizedGitStatus.set(cwd, gitStatus);
      return gitStatus;
    } catch (error) {
      this.memoizedGitStatus.set(cwd, null);
      return null;
    }
  }

  private async isGitRepo(cwd: string): Promise<boolean> {
    try {
      await execAsync("git rev-parse --git-dir", { cwd });
      return true;
    } catch {
      return false;
    }
  }

  private async getGitBranch(cwd: string): Promise<string> {
    try {
      const { stdout } = await execAsync("git branch --show-current", { cwd });
      return stdout.trim() || "unknown";
    } catch {
      try {
        const { stdout } = await execAsync("git rev-parse --short HEAD", { cwd });
        return `detached @ ${stdout.trim()}`;
      } catch {
        return "unknown";
      }
    }
  }

  private async getGitStatusOutput(cwd: string): Promise<string> {
    try {
      const { stdout } = await execAsync("git status --short", { cwd });
      return stdout;
    } catch {
      return "";
    }
  }

  private async getGitRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git remote get-url origin", { cwd });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async getLastCommitDate(cwd: string): Promise<Date | null> {
    try {
      const { stdout } = await execAsync(
        "git log -1 --format=%cd --date=iso-strict",
        { cwd }
      );
      return new Date(stdout.trim());
    } catch {
      return null;
    }
  }

  async loadClaudeMd(cwd: string): Promise<ClaudeMdContent | null> {
    const cached = this.claudeMdCache.get(cwd);
    if (cached !== undefined) {
      return cached;
    }

    const claudeMdPath = join(cwd, "CLAUDE.md");
    const dotClaudeMdPath = join(cwd, ".claude.md");

    try {
      if (existsSync(claudeMdPath)) {
        const content = await readFile(claudeMdPath, "utf-8");
        const parsed = this.parseClaudeMd(content, claudeMdPath);
        this.claudeMdCache.set(cwd, parsed);
        return parsed;
      } else if (existsSync(dotClaudeMdPath)) {
        const content = await readFile(dotClaudeMdPath, "utf-8");
        const parsed = this.parseClaudeMd(content, dotClaudeMdPath);
        this.claudeMdCache.set(cwd, parsed);
        return parsed;
      }
    } catch (error) {
      console.error("Error loading CLAUDE.md:", error);
    }

    this.claudeMdCache.set(cwd, null);
    return null;
  }

  private parseClaudeMd(content: string, location: string): ClaudeMdContent {
    const lines = content.split("\n");
    const sections: ClaudeMdSection[] = [];
    let currentHeading = "";
    let currentContent: string[] = [];
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        if (currentHeading) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join("\n").trim(),
            startLine,
            endLine: i,
          });
        }
        currentHeading = headingMatch[2].trim();
        currentContent = [];
        startLine = i + 1;
      } else {
        currentContent.push(line);
      }
    }

    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join("\n").trim(),
        startLine,
        endLine: lines.length,
      });
    }

    return {
      location,
      content,
      sections,
    };
  }

  async loadClaudeDir(cwd: string): Promise<ClaudeDirContent | null> {
    const claudeDirPath = join(cwd, ".claude");

    try {
      const dirExists = await this.pathExists(claudeDirPath);
      if (!dirExists) {
        return null;
      }

      const entries = await readdir(claudeDirPath);
      const files: { name: string; content: string }[] = [];

      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const filePath = join(claudeDirPath, entry);
          try {
            const content = await readFile(filePath, "utf-8");
            files.push({ name: entry, content });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      if (files.length === 0) {
        return null;
      }

      return {
        location: claudeDirPath,
        files,
      };
    } catch (error) {
      console.error("Error loading .claude directory:", error);
      return null;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private async listFiles(cwd: string): Promise<FileListing> {
    try {
      const entries = await readdir(cwd, { withFileTypes: true });
      const files: string[] = [];
      const directories: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          files.push(entry.name);
        } else if (entry.isDirectory()) {
          directories.push(entry.name);
        }
      }

      return { root: cwd, files, directories };
    } catch {
      return { root: cwd, files: [], directories: [] };
    }
  }

  private async getEnvVars(): Promise<Record<string, string>> {
    return {
      ...process.env,
    } as Record<string, string>;
  }

  private setupFileWatcher(cwd: string): void {
    if (this.watchers.has(cwd)) {
      return;
    }

    const claudeMdPath = join(cwd, "CLAUDE.md");
    const dotClaudeMdPath = join(cwd, ".claude.md");
    const claudeDirPath = join(cwd, ".claude");

    const invalidateCache = debounce(() => {
      this.invalidateCache(cwd);
    }, 2000);

    const pathsToWatch = [claudeMdPath, dotClaudeMdPath, claudeDirPath].filter(
      (p) => existsSync(p)
    );

    for (const path of pathsToWatch) {
      try {
        const watcher = watch(path, { persistent: false }, (eventType) => {
          if (eventType === "change" || eventType === "rename") {
            invalidateCache();
          }
        });
        this.watchers.set(path, watcher);
      } catch (error) {
        console.error(`Error setting up watcher for ${path}:`, error);
      }
    }

    this.debouncedInvalidate.set(cwd, invalidateCache);
  }

  private invalidateCache(cwd: string): void {
    this.memoizedGitStatus.delete(cwd);
    this.claudeMdCache.delete(cwd);
    this.projectContextCache.delete(cwd);

    console.log(`[ContextManager] Cache invalidated for ${cwd}`);
  }

  clearCache(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.debouncedInvalidate.clear();
    this.memoizedGitStatus.clear();
    this.claudeMdCache.clear();
    this.projectContextCache.clear();
  }
}