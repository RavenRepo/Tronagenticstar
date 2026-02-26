import { config } from "../config";
import { logger } from "../utils/logger";
import axios from "axios";

interface Service {
  name: string;
  url: string;
  healthPath: string;
  status: "healthy" | "unhealthy";
  lastCheck: Date;
}

export class ServiceDiscovery {
  private services: Service[] = [];
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeServices();
  }

  private initializeServices() {
    for (const serviceConfig of config.services) {
      this.services.push({
        name: serviceConfig.name,
        url: serviceConfig.url,
        healthPath: serviceConfig.healthPath || "/health",
        status: "unhealthy",
        lastCheck: new Date(0),
      });
    }
  }

  public start(intervalMs: number = 30000) {
    if (this.interval) {
      this.stop();
    }
    this.interval = setInterval(() => this.checkAllServices(), intervalMs);
    this.checkAllServices(); // Initial check
    logger.info("Service discovery started.", { interval: intervalMs });
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Service discovery stopped.");
    }
  }

  private async checkAllServices() {
    logger.info("Running service health checks...");
    for (const service of this.services) {
      this.checkServiceHealth(service);
    }
  }

  private async checkServiceHealth(service: Service) {
    try {
      const response = await axios.get(`${service.url}${service.healthPath}`, {
        timeout: 5000,
      });
      if (response.status === 200) {
        if (service.status === "unhealthy") {
          logger.info(`Service ${service.name} is now healthy.`);
        }
        service.status = "healthy";
      } else {
        if (service.status === "healthy") {
          logger.warn(`Service ${service.name} is now unhealthy.`);
        }
        service.status = "unhealthy";
      }
    } catch (error) {
      if (service.status === "healthy") {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          `Service ${service.name} is now unhealthy. Error: ${errMsg}`,
        );
      }
      service.status = "unhealthy";
    } finally {
      service.lastCheck = new Date();
    }
  }

  public getHealthyServices(serviceName?: string): Service[] {
    return this.services.filter(
      (s) =>
        s.status === "healthy" && (serviceName ? s.name === serviceName : true),
    );
  }

  public getAllServices(): Service[] {
    return this.services;
  }
}

export const serviceDiscovery = new ServiceDiscovery();
