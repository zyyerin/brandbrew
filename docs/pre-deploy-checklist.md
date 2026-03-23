# Pre-Deploy Checklist (Security + Reliability)

This checklist is the release gate for `main` to production.

## 1) Git And Change Control

- [ ] Release scope is documented (what changed, impact, rollback plan).
- [ ] PR merged through branch protection (no direct push to `main`).
- [ ] Required reviews completed.
- [ ] No accidental secret files in tracked changes.

## 2) Secrets And Environment

- [ ] Production secrets are only configured in deployment environment variables.
- [ ] Frontend only exposes safe `VITE_*` variables.
- [ ] `service_role` keys are never used in frontend code.
- [ ] `MODEL_EVAL_ENDPOINT` is configured in CI.
- [ ] Model eval auth is configured with either:
  - `MODEL_EVAL_API_KEY` (static token), or
  - `MODEL_EVAL_EMAIL` + `MODEL_EVAL_PASSWORD` + `MODEL_EVAL_SUPABASE_ANON_KEY` (recommended).

## 3) Automated Gates (Must Pass)

- [ ] `npx tsc --noEmit && npm run build` passes.
- [ ] `node scripts/eval-model.mjs` passes threshold checks.
- [ ] Security scan job passes.
- [ ] Deployment smoke test passes after release.

## 4) Runtime Safety

- [ ] Edge Function auth middleware is active on all protected routes.
- [ ] CORS allowlist contains only trusted origins.
- [ ] Error logs do not include secrets or tokens.
- [ ] Timeouts/retries are configured for external LLM/API calls.

## 5) Data And Recovery

- [ ] Database migration plan reviewed (if schema changed).
- [ ] Backup/restore path is validated.
- [ ] Rollback owner and rollback procedure are confirmed.

## 6) Manual Approval

- [ ] Production environment approval completed by release owner.
- [ ] Go/No-Go decision recorded in release note.

---

## CI/CD Mapping

This repository enforces gate checks with:

- Workflow: `.github/workflows/pre-deploy-gate.yml`
- Model eval script: `scripts/eval-model.mjs`
- Eval config: `config/model-eval-cases.json`

If any required gate fails, deployment must be blocked.
