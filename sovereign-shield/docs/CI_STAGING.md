CI Staging Guide

Purpose
This document explains the staging publish job added to the GitHub Actions workflow (/.github/workflows/ci.yml). The job builds the project, constructs a Docker image, and pushes a staging-tagged image to the GitHub Container Registry (GHCR).

When it runs
- Automatically on push to the 'staging' branch
- On manual workflow_dispatch (manual run from Actions UI)

What it does
- Runs tests and build steps (depends on 'test' and 'build' jobs)
- Logs into ghcr.io using the GITHUB_TOKEN (default) and pushes two tags:
  - :staging
  - :staging-<sha>
- Optionally creates a draft release when manually triggered and uploads build artifacts from dist/**

Required repository configuration
- The workflow uses the automatically provided GITHUB_TOKEN, which generally has permissions to write packages for the repository. If GHCR pushes fail due to permissions, create a Personal Access Token (PAT) with the 'write:packages' and 'read:packages' scopes and save it as repository secret GHCR_PAT, then replace the login step to use ${{ secrets.GHCR_PAT }}.

Security notes
- Do not commit PATs or secrets to the repository.
- Limit access to secrets to only the necessary teams and CI users.

How to trigger
- Push to the staging branch: git push origin staging
- Or use the Actions -> CI -> Run workflow -> workflow_dispatch in GitHub UI

Troubleshooting
- If image push fails with 403, check the token permissions and the repository owner (GHCR namespace differs for organization-level vs user-level).
- Check Actions run logs for docker/login-action and docker/build-push-action steps for detailed error messages.

Next steps
- Add a promotion step to move staging images to a release pipeline (signed images, vulnerability scan).
- Add automation to tag releases and create release artifacts.
