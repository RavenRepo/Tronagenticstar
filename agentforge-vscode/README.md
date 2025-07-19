# AgentForge VS Code Extension

The official VS Code extension for AgentForge - AI Agent Orchestration platform.

## Overview

The AgentForge VS Code extension provides a seamless interface for interacting with your AI agent orchestration system directly from your code editor. Manage agents, monitor activity, chat with agents, and trigger automated tasks without leaving VS Code.

## Features

### 🤖 Agent Management
- View all available agents in your workspace
- Monitor agent status (active, idle, error)
- Quick access to agent capabilities

### 📊 Activity Monitoring
- Real-time activity feed showing agent tasks
- Task status tracking (running, completed, failed)
- Detailed activity history and logs

### 💬 Agent Chat Interface
- Interactive chat with individual agents
- Context-aware conversations
- Multi-agent collaboration support

### 🎛️ Project Dashboard
- Overview of system health and metrics
- Quick action buttons for common tasks
- Performance statistics and analytics

### ⚙️ Configuration Management
- Easy setup of orchestrator connection
- API key management
- Real-time update preferences

## Quick Start

### 1. Installation

Install the extension from the VS Code Marketplace or manually:

```bash
# From VS Code Command Palette
Ctrl+Shift+P → "Extensions: Install Extensions" → Search "AgentForge"

# Or install from VSIX
code --install-extension agentforge-0.1.0.vsix
```

### 2. Configuration

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "AgentForge"
3. Configure your orchestrator URL (default: `http://localhost:3000`)
4. Add API key if authentication is required
5. Enable real-time updates for live monitoring

### 3. Usage

Access AgentForge features through:

- **Activity Bar**: Click the robot icon to open the AgentForge panel
- **Command Palette** (`Ctrl+Shift+P`): Type "AgentForge" to see all commands
- **Status Bar**: View connection status and quick actions

## Available Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `AgentForge: Show Dashboard` | Open the main dashboard | - |
| `AgentForge: Show Agent Activity` | View agent activity monitor | - |
| `AgentForge: Chat with Agents` | Open agent chat interface | - |
| `AgentForge: Analyze Architecture` | Trigger architecture analysis | - |
| `AgentForge: Security Scan` | Run security analysis | - |
| `AgentForge: Quality Check` | Perform code quality check | - |
| `AgentForge: Settings` | Open extension settings | - |

## Agents

The extension works with the following AgentForge agents:

### DesignForge
- Architecture analysis and design recommendations
- System design validation
- Pattern recognition and suggestions

### SecuriShield  
- Security vulnerability scanning
- Compliance checking
- Security best practices enforcement

### CodeCraft
- Code quality analysis
- Refactoring suggestions
- Code generation assistance

### PerfPulse
- Performance analysis and optimization
- Resource usage monitoring
- Bottleneck identification

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `agentforge.orchestratorUrl` | URL of the AgentForge orchestrator | `http://localhost:3000` |
| `agentforge.apiKey` | API key for authentication | - |
| `agentforge.enableRealTimeUpdates` | Enable WebSocket real-time updates | `true` |
| `agentforge.logLevel` | Logging verbosity level | `info` |

## Development

### Prerequisites

- Node.js 18+
- VS Code 1.74.0+
- TypeScript 5.0+

### Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd agentforge-vscode
npm install

# Build the extension
npm run compile

# Package for distribution
npm run package
```

### Testing

```bash
# Run tests
npm test

# Launch Extension Development Host
# Press F5 in VS Code
```

## Troubleshooting

### Connection Issues

1. **Cannot connect to orchestrator**
   - Verify the orchestrator URL in settings
   - Check if the orchestrator service is running
   - Verify network connectivity

2. **Authentication failed**
   - Check your API key in settings
   - Ensure the API key has proper permissions

3. **Real-time updates not working**
   - Verify WebSocket connection is enabled
   - Check firewall settings
   - Try disabling and re-enabling real-time updates

### Performance Issues

1. **Extension slow to load**
   - Check orchestrator response times
   - Reduce activity history limit
   - Disable real-time updates temporarily

2. **High CPU usage**
   - Check log level settings (reduce to 'warn' or 'error')
   - Limit number of concurrent agent activities

## API Integration

The extension integrates with the AgentForge orchestrator through:

- **REST API**: Task management, agent status, metrics
- **WebSocket**: Real-time updates and notifications
- **Authentication**: Bearer token or API key based

### Expected API Endpoints

```
GET  /api/agents           # List available agents
GET  /api/activity         # Get agent activity history
POST /api/agents/{id}/trigger  # Trigger agent task
GET  /api/metrics          # System metrics
GET  /health               # Health check
WS   /api/events           # Real-time event stream
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/agentforge/docs)
- 🐛 [Issues](https://github.com/agentforge/vscode-extension/issues)
- 💬 [Discussions](https://github.com/agentforge/vscode-extension/discussions)
- 📧 [Email Support](mailto:support@agentforge.dev)

## Changelog

### v0.1.0 (Initial Release)
- ✨ Initial release with core functionality
- 🤖 Agent management and monitoring
- 💬 Agent chat interface
- 📊 Project dashboard
- ⚙️ Configuration management
- 🔄 Real-time updates via WebSocket
