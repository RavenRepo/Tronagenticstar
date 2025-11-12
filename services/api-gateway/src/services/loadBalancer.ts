
import { ServiceDiscovery } from "./discovery";
import { logger } from "../utils/logger";

interface Service {
  name: string;
  url: string;
  healthPath: string;
  status: "healthy" | "unhealthy";
  lastCheck: Date;
}

export class LoadBalancer {
  private serviceDiscovery: ServiceDiscovery;
  private currentIndex: { [key: string]: number } = {};

  constructor(serviceDiscovery: ServiceDiscovery) {
    this.serviceDiscovery = serviceDiscovery;
  }

  public getService(serviceName: string): Service | null {
    const healthyServices = this.serviceDiscovery.getHealthyServices(serviceName);
    if (healthyServices.length === 0) {
      logger.error(`No healthy services found for ${serviceName}`);
      return null;
    }

    if (!this.currentIndex[serviceName]) {
      this.currentIndex[serviceName] = 0;
    }

    const service = healthyServices[this.currentIndex[serviceName]];
    this.currentIndex[serviceName] =
      (this.currentIndex[serviceName] + 1) % healthyServices.length;

    return service;
  }
}
