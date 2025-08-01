#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status.

PORT=8001
# Correct path to the venv from the package directory
VENV_PYTHON="../../venvagents/bin/python"

# Check if the virtual environment exists
if [ ! -f "$VENV_PYTHON" ]; then
  echo "Error: Python virtual environment not found at $VENV_PYTHON" >&2
  exit 1
fi

# Check if the port is in use
if lsof -i :$PORT; then
  echo "Port $PORT is already in use. Assuming agent is running."
else
  echo "Starting codecraft agent on port $PORT..."
  # Use the python from the virtual environment
  $VENV_PYTHON -m uvicorn services.codecraft.main:app --port $PORT &
  echo $! > .agent_pid
  sleep 5 # Wait for agent to start
fi