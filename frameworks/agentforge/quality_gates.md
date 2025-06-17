# Quality Gates & CI Automation

This file defines **enforceable quality criteria**. The accompanying script `scripts/quality_gate.py` is executed in GitHub Actions.

| Gate | Trigger | Blocking? | Checks |
|------|---------|-----------|--------|
| Design Review | PR adds agent or framework feature | Yes | ADR reference exists, architecture diagram updated |
| Lint/Test | Every PR | Yes | `pytest -q`, `black --check`, `pylint ≥9.0`, `tsc --noEmit`, `eslint` |
| Coverage | Every PR | Yes | `pytest --cov` ≥ 85 % lines |
| Security Scan | Every merge to main | Yes | `bandit -r`, `npm audit --production` no criticals |
| Docs Sync | Markdown changed | No (warn) | `scripts/diagram_check.py`, broken links, mermaid compile |
| Release | `v*.*.*` tag | Yes | CHANGELOG entry, semver bump, `AGENTFORGE_VERSION.md` matches tag |

## CI Steps (GitHub Actions)
```yaml
jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v4
        with: { python-version: '3.11' }
      - uses: pnpm/action-setup@v2
      - name: Install deps
        run: |
          pip install -r requirements.txt
          pnpm install --frozen-lockfile
      - name: Run Quality Gate
        run: python scripts/quality_gate.py
```

## Evolution Process
1. Propose gate change via PR.
2. Update this file + automation script.
3. Tag reviewers `@qa-lead` `@security`.

---
*Owner*: QA Lead – adjust thresholds each release. 