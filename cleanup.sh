#!/bin/bash

# Remove node_modules directories
find . -type d -name "node_modules" -exec rm -rf {} +

# Remove Python cache files
find . -type d -name "__pycache__" -exec rm -rf {} +
find . -type d -name ".pytest_cache" -exec rm -rf {} +
find . -type f -name "*.pyc" -delete
find . -type f -name "*.pyo" -delete
find . -type f -name "*.pyd" -delete
find . -type d -name ".mypy_cache" -exec rm -rf {} +

# Remove build and dist directories
find . -type d -name "build" -exec rm -rf {} +
find . -type d -name "dist" -exec rm -rf {} +
find . -type d -name "*.egg-info" -exec rm -rf {} +

# Remove package-lock.json and yarn.lock
find . -type f -name "package-lock.json" -delete
find . -type f -name "yarn.lock" -delete

# Remove virtual environment directories
find . -type d -name "venv" -exec rm -rf {} +
find . -type d -name ".venv" -exec rm -rf {} +
find . -type d -name "env" -exec rm -rf {} +

# Remove IDE specific files/directories
find . -type d -name ".vscode" -exec rm -rf {} +
find . -type d -name ".idea" -exec rm -rf {} +
find . -type f -name "*.sublime-workspace" -delete
find . -type f -name "*.sublime-project" -delete

# Remove coverage and test result directories
find . -type d -name "coverage" -exec rm -rf {} +
find . -type d -name ".coverage" -delete
find . -type d -name "htmlcov" -exec rm -rf {} +

echo "Project cleaned successfully!"
