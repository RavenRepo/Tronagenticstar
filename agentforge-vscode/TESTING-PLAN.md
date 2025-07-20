# AgentForge Extension Testing Plan

## Pre-Test Setup ✅
- [x] Extension compiled successfully
- [x] No critical errors (only expected WebSocket warnings)
- [x] Launch configuration ready
- [x] Package.json manifest validated

## Test Categories

### 🚀 **Extension Activation Tests**
1. **Basic Activation**
   - [ ] Extension loads without errors
   - [ ] AgentForge activity bar icon appears
   - [ ] Extension context is set correctly

2. **Command Registration**
   - [ ] All commands appear in Command Palette (Ctrl+Shift+P)
   - [ ] Commands are properly categorized under "AgentForge"
   - [ ] Icons display correctly

### 🎛️ **UI Component Tests**

#### **Activity Bar & Views**
- [ ] AgentForge activity bar icon clickable
- [ ] "Agent Activity" view loads
- [ ] "Available Agents" view loads
- [ ] Refresh button works in activity view

#### **Chat Panel Tests** (Our G5 Implementation)
- [ ] Chat panel opens with "AgentForge: Chat with Agents" command
- [ ] Agent dropdown populates with fallback agents
- [ ] Agent selection enables input and buttons
- [ ] Message input auto-resizes
- [ ] Template buttons work (Architecture, Security, etc.)
- [ ] Code insertion button responds
- [ ] File attachment button responds
- [ ] Export functionality works
- [ ] Metrics overlay displays
- [ ] Keyboard shortcuts overlay displays

#### **Other Panels**
- [ ] Dashboard panel opens and displays
- [ ] Settings panel opens and displays
- [ ] Activity panel shows agent status

### 💬 **Chat Functionality Tests**

#### **Message Flow**
- [ ] User can type and send messages
- [ ] Agent responses appear with typing indicator
- [ ] Message formatting works (bold, italic, code)
- [ ] Message actions (copy, like, retry) function
- [ ] Chat history persists across panel reopens

#### **Agent Interaction**
- [ ] Different agents can be selected
- [ ] Agent-specific buttons enable/disable correctly
- [ ] Agent status indicators show correctly
- [ ] Agent welcome messages appear

#### **Advanced Features**
- [ ] Keyboard shortcuts work (Ctrl+K, Ctrl+Shift+C, etc.)
- [ ] Chat export saves file correctly
- [ ] Session metrics track accurately
- [ ] State persistence works

### 🔧 **Integration Tests**

#### **VS Code Integration**
- [ ] Current editor context detection
- [ ] File selection and content reading
- [ ] Theme integration (dark/light mode)
- [ ] Status bar integration

#### **Error Handling**
- [ ] Graceful fallback when orchestrator API unavailable
- [ ] Error messages display appropriately
- [ ] Extension doesn't crash on invalid input

## Expected Results

### ✅ **Should Work**
- Extension activation and UI display
- Chat panel with rich interface
- Agent selection and basic interaction
- Message formatting and actions
- Template button functionality
- Export and metrics features
- Keyboard shortcuts
- State persistence

### ⚠️ **Expected Limitations**
- Agent responses are simulated (not real API calls)
- Some advanced features may be placeholder
- Performance may vary in development mode

### 🚫 **Known Issues**
- WebSocket warnings (expected, not critical)
- Some commands may be placeholders for G6

## Success Criteria

### **Minimum Viable Test Success**
- [x] Extension compiles without errors
- [ ] Extension activates and loads UI
- [ ] Chat panel opens and basic functionality works
- [ ] No critical runtime errors

### **Comprehensive Test Success**
- [ ] All UI components load and display correctly
- [ ] Chat functionality works end-to-end
- [ ] Advanced features (export, metrics, shortcuts) work
- [ ] Extension integrates well with VS Code

---

**Test Status**: Ready to begin
**Test Environment**: VS Code Extension Development Host
**Expected Duration**: 15-20 minutes for comprehensive testing
