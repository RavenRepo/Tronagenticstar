import json
import os
import random
import time
import uuid

from locust import HttpUser, between, events, task

# Get the agent bearer token from environment or use a default for testing
AGENT_BEARER = os.getenv("AGENT_BEARER", "constella-dev-token-123")
HEADERS = {
    "Authorization": f"Bearer {AGENT_BEARER}",
    "Content-Type": "application/json",
}


class ConstellaAgentUser(HttpUser):
    """
    Simulates a user or orchestrator interacting with the Constella AI Platform agents.
    """

    wait_time = between(1, 5)  # Wait 1-5 seconds between tasks

    def on_start(self):
        """Called when a Locust user starts before any task is scheduled"""
        self.session_id = str(uuid.uuid4())

    @task(3)
    def check_health(self):
        """Test the health endpoint of the API Gateway"""
        self.client.get("/health", headers=HEADERS, name="/health")

    @task(1)
    def check_agent_capabilities(self):
        """Test the capabilities endpoint of various agents"""
        agents = [
            "codecraft",
            "securishield",
            "evaluator",
            "perfpulse",
            "soc2-compliance",
        ]
        agent = random.choice(agents)

        # In a real deployment, these would be routed through the API gateway
        # For direct testing, we might need to hit specific ports if not using gateway
        # Assuming API gateway routes /api/v1/{agent}/capabilities
        self.client.get(
            f"/api/v1/{agent}/capabilities",
            headers=HEADERS,
            name=f"/{agent}/capabilities",
        )

    @task(2)
    def execute_perfpulse_task(self):
        """Simulate sending a performance analysis task to PerfPulse"""
        task_id = f"perf-task-{uuid.uuid4().hex[:8]}"

        payload = {
            "task_id": task_id,
            "task_type": "analyze_performance",
            "parameters": {
                "service_name": "api-gateway",
                "metrics": {
                    "cpu_percent": random.uniform(10.0, 95.0),
                    "memory_percent": random.uniform(20.0, 90.0),
                    "latency_ms": random.uniform(50.0, 500.0),
                    "error_rate": random.uniform(0.0, 5.0),
                },
            },
        }

        with self.client.post(
            "/api/v1/perfpulse/execute_task",
            json=payload,
            headers=HEADERS,
            name="/perfpulse/execute_task",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(
                    f"Failed with status {response.status_code}: {response.text}"
                )

    @task(1)
    def execute_soc2_task(self):
        """Simulate sending a compliance evaluation task to SOC2 Compliance Agent"""
        task_id = f"soc2-task-{uuid.uuid4().hex[:8]}"

        payload = {
            "task_id": task_id,
            "task_type": "evaluate_compliance",
            "parameters": {
                "service_name": "database-agent",
                "rules": ["CC6.1", "CC6.2"],
                "evidence_data": {
                    "access_logs_enabled": True,
                    "mfa_enforced": True,
                    "encryption_at_rest": True,
                },
            },
        }

        with self.client.post(
            "/api/v1/soc2-compliance/execute_task",
            json=payload,
            headers=HEADERS,
            name="/soc2-compliance/execute_task",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(
                    f"Failed with status {response.status_code}: {response.text}"
                )


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("Starting Constella AI Platform performance test")
    print(f"Target host: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("Performance test completed")
