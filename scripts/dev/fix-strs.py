import os
from pathlib import Path

app_dir = Path("interfaces/dashboard/src/app")

replacements = {
    'bg-white/[0.02]': 'bg-bg-secondary',
    'bg-white/[0.03]': 'bg-bg-secondary',
    'bg-white/[0.01]': 'bg-bg-secondary',
    'bg-white/[0.04]': 'bg-bg-hover',
    'bg-white/[0.05]': 'bg-bg-hover',
    'bg-white/[0.06]': 'bg-bg-hover',
    'bg-white/[0.08]': 'bg-bg-hover',
    'bg-white/[0.12]': 'bg-bg-active',
    'bg-white/[0.1]': 'bg-bg-active',
    'border-white/[0.03]': 'border-border',
    'border-white/[0.04]': 'border-border',
    'border-white/[0.06]': 'border-border',
    'border-white/[0.08]': 'border-border-light',
    'border-white/[0.12]': 'border-border-light',
    'bg-[#0f1117]': 'bg-bg-primary',
    'bg-[#0c0e14]': 'bg-bg-primary',
    'bg-black/40': 'bg-bg-secondary',
    'bg-black/30': 'bg-bg-secondary',
    'text-white': 'text-text-primary',
    'text-zinc-400': 'text-text-secondary',
    'text-zinc-500': 'text-text-tertiary',
}

for filepath in app_dir.rglob("*.tsx"):
    if "security" in str(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
