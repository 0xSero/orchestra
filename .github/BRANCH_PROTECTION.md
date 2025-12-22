# Branch Protection Rules

This document describes the recommended GitHub branch protection settings for this repository.

## Setup Instructions

Go to **Settings → Branches → Add branch protection rule** for each branch pattern below.

---

## `main` Branch

**Pattern:** `main`

### Protection Settings

- [x] **Require a pull request before merging**
  - [x] Require approvals: `1`
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require approval of the most recent reviewable push

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Required checks:
    - `build`
    - `test`

- [x] **Require conversation resolution before merging**

- [x] **Do not allow bypassing the above settings**

- [x] **Restrict who can push to matching branches**
  - Only allow merges via PR (no direct pushes)

- [ ] **Allow force pushes** - DISABLED
- [ ] **Allow deletions** - DISABLED

---

## `release/*` Branches

**Pattern:** `release/*`

### Protection Settings

- [x] **Require a pull request before merging**
  - [x] Require approvals: `1`

- [x] **Require status checks to pass before merging**
  - Required checks:
    - `build`
    - `test`

- [x] **Require conversation resolution before merging**

- [ ] **Allow force pushes** - DISABLED
- [ ] **Allow deletions** - DISABLED (until release is merged)

---

## `develop` Branch (Optional)

**Pattern:** `develop`

### Protection Settings

- [x] **Require a pull request before merging**
  - Require approvals: `1` (or `0` for solo projects)

- [x] **Require status checks to pass before merging**
  - Required checks:
    - `build`
    - `test`

---

## Workflow Summary

```
feature/* ──────┐
                ├──► release/vX.X.X ──► main (tag vX.X.X)
fix/*     ──────┘
```

1. **Feature/fix branches** → PR to `release/vX.X.X`
2. **Release branch** → PR to `main` when ready
3. **Tag release** on `main` after merge
4. **Delete release branch** after successful release

---

## GitHub CLI Commands

If you prefer CLI, you can set these via `gh`:

```bash
# Protect main branch
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  -F required_status_checks='{"strict":true,"contexts":["build","test"]}' \
  -F enforce_admins=true \
  -F required_pull_request_reviews='{"required_approving_review_count":1}'
```

---

## Rulesets (Recommended for GitHub Pro/Enterprise)

GitHub Rulesets provide more granular control. Consider using rulesets for:
- Commit message format enforcement
- File path restrictions
- Deployment environment gates
