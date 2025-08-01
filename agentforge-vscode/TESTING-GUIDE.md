# 🧪 AgentForge Extension Testing Guide

## How to Test the Extension

### Step 1: Launch Extension Development Host
1. Open VS Code in the `agentforge-vscode` folder
2. Press `F5` or go to Run > Start Debugging
3. This will open a new VS Code window with the extension loaded

### Step 2: Basic Activation Test
1. **Check Activity Bar**: Look for the 🤖 AgentForge icon in the left sidebar
2. **Command Palette**: Press `Ctrl+Shift+P` and type "AgentForge" - you should see our commands
3. **No Error Toast**: The extension should load without error notifications

### Step 3: Chat Panel Test (Our G5 Implementation)
1. **Open Chat**: `Ctrl+Shift+P` → "AgentForge: Chat with Agents"
2. **Agent Selection**: Try selecting different agents from the dropdown
3. **Message Input**: Type a message and press Enter
4. **Template Buttons**: Try the quick action buttons (🏗️ Architecture, 🛡️ Security, etc.)
5. **Code Insertion**: Click the 📝 Code button (should prompt if no code selected)
6. **Export Feature**: Click 💾 Export Chat button
7. **Metrics**: Click 📊 Metrics to see session stats
8. **Shortcuts**: Click ⌨️ Shortcuts to see keyboard shortcuts

### Step 4: Advanced Chat Features Test
1. **Agent Switching**: Switch between different agents and verify behavior
2. **Message Formatting**: Send messages with `code`, **bold**, *italic*
3. **Message Actions**: Try Copy, Like, and Retry buttons on messages
4. **Keyboard Shortcuts**: 
   - `Ctrl+K`: Should focus message input
   - `Enter`: Send message
   - `Shift+Enter`: New line in message

### Step 5: State Persistence Test
1. **Close and Reopen**: Close the chat panel and reopen it
2. **Verify State**: Chat history and selected agent should persist
3. **Extension Restart**: Reload VS Code window (`Ctrl+R`) and reopen chat

### Step 6: Integration Test
1. **File Context**: Open a code file, select some code, then try 📝 Code button
2. **Theme Integration**: Switch VS Code theme (dark/light) and verify chat appearance
3. **Multiple Panels**: Try opening multiple AgentForge panels simultaneously

### Step 7: Error Handling Test
1. **No Selection**: Try code insertion with no file open
2. **Empty Messages**: Try sending empty messages
3. **Agent Unavailable**: Verify fallback agents load when API is unavailable

## Expected Test Results

### ✅ Should Work Perfectly
- Extension loads without errors
- Chat panel opens with professional UI
- Agent selection and message sending
- Template buttons and quick actions
- Export functionality
- Metrics and shortcuts overlays
- Message formatting and actions
- State persistence
- Keyboard shortcuts

### ⚠️ Expected Limitations
- **Simulated Responses**: Agent responses are currently mocked (not real API)
- **Code Analysis**: Some advanced features are placeholders
- **Real-time Features**: WebSocket connections may show warnings

### 🚫 Known Issues to Ignore
- WebSocket warnings in debug console (expected)
- Some commands may be placeholders for G6
- Performance may be slower in development mode

## Detailed Test Checklist

### Basic Functionality ✓
- [ ] Extension activates without errors
- [ ] AgentForge activity bar icon appears
- [ ] Commands appear in Command Palette
- [ ] Chat panel opens successfully

### Chat Interface ✓
- [ ] Agent dropdown shows 4 fallback agents
- [ ] Agent selection enables input and buttons
- [ ] Message input auto-resizes as you type
- [ ] Send button works with Enter key
- [ ] Messages appear with timestamps

### Advanced Features ✓
- [ ] Template buttons insert text correctly
- [ ] Code insertion button responds (may show "no editor" message)
- [ ] Export opens save dialog
- [ ] Metrics show session statistics
- [ ] Shortcuts overlay displays help

### UI/UX ✓
- [ ] Professional appearance matching VS Code theme
- [ ] Smooth animations and transitions
- [ ] Responsive layout
- [ ] Clear visual feedback for all actions

### Persistence ✓
- [ ] Chat history survives panel close/reopen
- [ ] Selected agent persists
- [ ] Settings and state maintained

## Performance Expectations
- **Extension Load**: < 2 seconds
- **Chat Panel Open**: < 1 second  
- **Message Send**: < 1 second (simulated response)
- **UI Interactions**: Immediate response

## Success Criteria
✅ **PASS**: All basic functionality works, no critical errors, professional UX
⚠️ **PARTIAL**: Some features work, minor issues, acceptable for development
❌ **FAIL**: Critical errors, extension doesn't load, or major functionality broken

---

## 🎯 After Testing

Once you've tested the extension, we can:
1. **Fix any issues** discovered during testing
2. **Proceed with G6** (Code Generation Commands) if testing is successful
3. **Document any improvements** needed for the next iteration

**Ready to test? Press F5 in VS Code to launch the extension development host!** 🚀
