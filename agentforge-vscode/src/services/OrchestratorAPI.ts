import * as vscode from "vscode";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { Config } from "../utils/config";
import { logger } from "../utils/logger";

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: "active" | "idle" | "error";
  lastActivity?: Date;
  description?: string;
  capabilities?: string[];
  version?: string;
}

export interface AgentActivity {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  status: "running" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

export interface TriggerAgentRequest {
  action: string;
  workspace?: string;
  parameters?: Record<string, any>;
}

export interface GatewayStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  services: {
    [serviceName: string]: {
      status: "healthy" | "unhealthy";
      url: string;
      responseTime: number;
    };
  };
  uptime: number;
}

export class OrchestratorAPI {
  private client: AxiosInstance;
  private config: Config;

  constructor(private context: vscode.ExtensionContext) {
    this.config = new Config();
    this.client = axios.create({
      baseURL: this.config.getOrchestratorUrl(),
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AgentForge-VSCode/0.1.0",
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => {
        const apiKey = this.config.getApiKey();
        if (apiKey) {
          // Support both API Key and JWT authentication
          if (apiKey.startsWith("eyJ")) {
            // JWT token
            config.headers.Authorization = `Bearer ${apiKey}`;
          } else {
            // API Key
            config.headers["X-API-Key"] = apiKey;
          }
        }
        return config;
      },
      (error) => {
        logger.error("Request interceptor error", error);
        return Promise.reject(error);
      },
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // Log rate limiting headers
        if (response.headers["x-ratelimit-remaining"]) {
          logger.debug(
            `Rate limit remaining: ${response.headers["x-ratelimit-remaining"]}`,
          );
        }
        return response;
      },
      (error) => {
        logger.error("API request failed", error);
        if (error.response?.status === 401) {
          vscode.window.showErrorMessage(
            "Authentication failed. Please check your API key or JWT token.",
          );
        } else if (error.response?.status === 429) {
          vscode.window.showWarningMessage(
            "Rate limit exceeded. Please wait before making more requests.",
          );
        } else if (error.response?.status >= 500) {
          vscode.window.showErrorMessage(
            "Server error. Please try again later.",
          );
        } else if (error.code === "ECONNREFUSED") {
          vscode.window.showErrorMessage(
            "Cannot connect to API Gateway. Please check the URL.",
          );
        }
        return Promise.reject(error);
      },
    );
  }

  async getAgents(): Promise<Agent[]> {
    try {
      const response: AxiosResponse<Agent[]> =
        await this.client.get("/v1/agents");
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch agents", error);
      throw error;
    }
  }

  async getAgentActivity(limit: number = 50): Promise<AgentActivity[]> {
    try {
      const response: AxiosResponse<AgentActivity[]> = await this.client.get(
        "/v1/activity",
        {
          params: { limit },
        },
      );
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch agent activity", error);
      throw error;
    }
  }

  async triggerAgent(
    agentName: string,
    request: TriggerAgentRequest,
  ): Promise<string> {
    try {
      const response: AxiosResponse<{ taskId: string }> =
        await this.client.post(`/v1/agents/${agentName}/trigger`, request);
      return response.data.taskId;
    } catch (error) {
      logger.error(`Failed to trigger agent ${agentName}`, error);
      throw error;
    }
  }

  async generateAgent(name: string, type: string): Promise<void> {
    try {
      await this.client.post("/v1/agents/generate", {
        name,
        type,
        workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });
    } catch (error) {
      logger.error(`Failed to generate agent ${name}`, error);
      throw error;
    }
  }

  async getHealth(): Promise<boolean> {
    try {
      const response = await this.client.get("/health");
      return response.status === 200;
    } catch (error) {
      logger.error("Health check failed", error);
      return false;
    }
  }

  async getMetrics(): Promise<any> {
    try {
      const response = await this.client.get("/metrics");
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch metrics", error);
      throw error;
    }
  }

  async getGatewayStatus(): Promise<GatewayStatus> {
    try {
      const response: AxiosResponse<GatewayStatus> =
        await this.client.get("/v1/status");
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch gateway status", error);
      throw error;
    }
  }

  async proxyToService(
    serviceName: string,
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: any,
  ): Promise<any> {
    try {
      const response = await this.client.request({
        method,
        url: `/v1/services/${serviceName}${path}`,
        data,
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to proxy request to ${serviceName}${path}`, error);
      throw error;
    }
  }

  async getDevTokens(): Promise<{ admin: string; user: string }> {
    try {
      const response = await this.client.get("/dev/tokens");
      return response.data;
    } catch (error) {
      logger.error("Failed to get dev tokens", error);
      throw error;
    }
  }

  updateBaseURL(url: string) {
    this.client.defaults.baseURL = url;
    logger.info(`Updated API Gateway URL to: ${url}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      if (health) {
        const status = await this.getGatewayStatus();
        logger.info(
          `Connected to API Gateway v${status.version}, ${Object.keys(status.services).length} services available`,
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Connection test failed", error);
      return false;
    }
  }
}
