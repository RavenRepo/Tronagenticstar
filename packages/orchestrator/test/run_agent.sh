#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status.

PORT=8011

# Activate the virtual environment
source /media/blackknight/Dev/My-Projects/Tronagenticstar-master/venvagents/bin/activate

# Check if the port is in use
if lsof -i :$PORT; then
  echo "Port $PORT is already in use. Assuming agent is running."
else
  echo "Starting codecraft agent on port $PORT..."
  # Now that the venv is active, we can call uvicorn directly
  uvicorn services.codecraft.main:app --port $PORT &
  echo $! > packages/orchestrator/test/.agent_pid
  sleep 5 # Wait for agent to start
fi