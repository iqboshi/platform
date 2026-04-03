# Contributing

## Branching

- Branch from `main`
- Use `feature/*`, `fix/*`, `chore/*`, or `docs/*`
- Open a PR for every change

## Development Standards

- Backend: `ruff`, `pytest`
- Frontend: `eslint`, `vitest`, `vite build`
- Keep environment-specific secrets out of the repo
- Prefer shared types and central config over local duplication

## Suggested Flow

1. Sync from `main`
2. Create a short-lived branch
3. Make focused changes
4. Run local checks
5. Open a PR with screenshots or API notes when relevant

## Pull Request Checklist

- Feature or fix has clear scope
- Tests or validation updated
- Docs updated when behavior changes
- No secrets or generated artifacts committed
