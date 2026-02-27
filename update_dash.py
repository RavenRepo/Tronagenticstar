import sys

with open('interfaces/dashboard/src/app/page.tsx', 'r') as f:
    content = f.read()

comps = """
// ---------------------------------------------------------------------------
// Dashboard Sub-components (Bento)
// ---------------------------------------------------------------------------

function TopologyMap({ agents }: { agents: AgentHealth[] }) {
  return (
    <div className="relative w-full h-full min-h-[350px] flex items-center justify-center overflow-hidden mt-2">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,153,255,0.08)_0%,transparent_60%)] animate-pulse-slow pointer-events-none"></div>
      
      {/* Central Node */}
      <div className="relative z-10 flex flex-col items-center justify-center p-5 glass-panel border-brand/40 shadow-[0_0_30px_rgba(0,153,255,0.3)] animate-pulse-slow pointer-events-none">
        <Server className="w-8 h-8 text-brand" />
        <span className="text-xs font-bold mt-3 text-text-primary tracking-widest uppercase">Orchestrator</span>
      </div>

      {/* Surrounding Nodes */}
      {agents.slice(0, 8).map((agent, i) => {
         const angle = (i / Math.min(8, agents.length)) * Math.PI * 2;
         const radius = 140; // px
         const x = Math.cos(angle) * radius;
         const y = Math.sin(angle) * radius;
         const Icon = agent.icon;
         const isActive = agent.status === "healthy";
         
         return (
           <React.Fragment key={agent.id}>
             <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
               <line 
                 x1="50%" y1="50%" 
                 x2={`calc(50% + ${x}px)`} y2={`calc(50% + ${y}px)`} 
                 stroke={isActive ? "hsl(var(--color-brand))" : "hsl(var(--color-border))"} 
                 strokeWidth="1.5" 
                 strokeDasharray={isActive ? "4 4" : "none"}
                 className={isActive ? "animate-[border-beam_20s_linear_infinite]" : ""}
                 opacity={isActive ? "0.6" : "0.3"}
               />
             </svg>
             
             <div 
               className={`absolute z-10 flex h-12 w-12 items-center justify-center rounded-xl glass-panel transition-all hover:scale-110 cursor-pointer ${isActive ? "border-brand-light/40 shadow-[0_0_15px_rgba(0,153,255,0.2)]" : "border-border/40 opacity-50"}`}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               title={agent.name}
             >
               <Icon className={`w-5 h-5 ${agent.color.includes('red') ? 'text-red-400' : isActive ? "text-text-primary" : "text-text-tertiary"}`} />
             </div>
           </React.Fragment>
         );
      })}
    </div>
  );
}

function LiveExecutionStream() {
  const [logs, setLogs] = useState<{id: number, text: string, type: 'info'|'success'|'warn'}[]>([]);
  
  useEffect(() => {
    const messages = [
      "SecuriShield: Dependency scan completed. 0 criticals.",
      "CodeCraft: Refactoring main loop in auth.ts",
      "Orchestrator: Routing payload to CodeCraft.",
      "DesignForge: Syncing C4 diagram with latest commit.",
      "PerfPulse: Memory usage stabilized at 42%",
      "Evaluator: E2E test suite passed (12ms).",
      "Database Agent: Optimizing indices for Users table.",
      "ExpressOps: Restarting worker processes.",
      "Orchestrator: Health check verified. All systems nominal."
    ];
    let id = 0;
    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      setLogs(prev => {
        const next = [...prev, { id: id++, text: msg, type: Math.random() > 0.8 ? 'success' : 'info' }];
        if (next.length > 7) return next.slice(next.length - 7);
        return next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 w-full bg-[#030303]/80 border border-border/30 rounded-xl p-5 font-mono text-xs overflow-hidden relative shadow-inner mt-2">
       <div className="flex gap-2 mb-4 opacity-50">
         <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
         <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
         <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
       </div>
       <div className="space-y-2.5 flex flex-col justify-end h-[calc(100%-2rem)]">
         {logs.map((log) => (
           <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3">
             <span className="text-text-tertiary/50 shrink-0">[{new Date().toLocaleTimeString([], {hour12:false})}]</span>
             <span className={log.type === 'success' ? 'text-emerald-400' : 'text-blue-300'}>{log.text}</span>
           </div>
         ))}
         {logs.length === 0 && <span className="text-text-tertiary/50 animate-pulse">Establishing secure connection to swarm...</span>}
       </div>
    </div>
  );
}

export default function DashboardPage() {
"""

content = content.replace("export default function DashboardPage() {", comps)

start_idx = content.find("  return (\n    <div className=\"min-h-screen")
if start_idx == -1:
    print("Could not find return statement")
    sys.exit(1)

new_return = '''  return (
    <div className="min-h-screen text-text-primary pb-12">
      {/* Main content */}
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        
        {/* WAR ROOM BENTO GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <StatsBar stats={stats} />
            
            <section className="flex-1 glass-panel p-6 relative group overflow-hidden flex flex-col min-h-[450px]">
               <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 tracking-wide uppercase">
                 <Workflow className="w-4 h-4 text-brand"/> Swarm Topology
               </h2>
               <TopologyMap agents={agents} />
            </section>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <section className="flex-1 glass-panel p-6 flex flex-col min-h-[450px]">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2 tracking-wide uppercase">
                <Terminal className="w-4 h-4 text-brand"/> Thought Log
              </h2>
              <LiveExecutionStream />
            </section>
          </div>
        </div>

        {/* Quick Actions Array */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">Command Shortcuts</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionCard
                key={`${action.agentId}-${action.taskType}`}
                action={action}
                onClick={setActiveAction}
              />
            ))}
          </div>
        </section>

        {/* Agent Fleet Grid */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">Active Fleet</h2>
            </div>
            <p className="text-xs text-brand font-mono bg-brand/10 px-2 py-1 rounded">
              {stats.healthyAgents}/{stats.totalAgents} ONLINE
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onSelect={setSelectedAgent} />
            ))}
          </div>
        </section>

      </main>

      {/* Modals */}
      {selectedAgent && (
        <AgentDetailPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
      {activeAction && (
        <TaskModal action={activeAction} onClose={() => setActiveAction(null)} />
      )}
    </div>
  );
}'''

content = content[:start_idx] + new_return + "\n"

with open('interfaces/dashboard/src/app/page.tsx', 'w') as f:
    f.write(content)

print("Updated page.tsx successfully.")
