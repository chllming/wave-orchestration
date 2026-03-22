# npmjs Trusted Publishing

This repo now includes a dedicated npmjs publish workflow at [publish-npm.yml](../../.github/workflows/publish-npm.yml).

It is designed for npm trusted publishing from GitHub Actions, so the publish step does not need an `NPM_TOKEN`.

## What This Repo Already Does

- `package.json` no longer hardcodes GitHub Packages as the publish registry.
- `publish-npm.yml` publishes tagged releases to `https://registry.npmjs.org`.
- `publish-package.yml` still publishes to GitHub Packages explicitly, so both registries can coexist.

## One-Time npm Setup

1. Open the package settings for `@chllming/wave-orchestration` on npmjs.com.
2. Go to `Settings` -> `Trusted publishing`.
3. Add a GitHub Actions trusted publisher with:
   - organization or user: `chllming`
   - repository: `wave-orchestration`
   - workflow filename: `publish-npm.yml`
   - environment name: leave empty unless you later add a protected GitHub environment to the workflow
4. Save the trusted publisher.

If npmjs does not expose package settings for `@chllming/wave-orchestration` yet, complete the first npmjs publish manually once, then return and configure trusted publishing for later releases.

## GitHub Workflow Behavior

The npmjs workflow:

- runs on GitHub-hosted runners
- requires `contents: read` and `id-token: write`
- installs dependencies with `pnpm install --frozen-lockfile`
- runs `pnpm test`
- publishes with `pnpm publish --access public --no-git-checks`

Trusted publishing depends on npm's OIDC support. The workflow is configured for Node 24 so the runner satisfies npm's current trusted-publishing requirements.

## Security Follow-Up

After the first trusted publish succeeds:

1. Return to the npm package settings.
2. Restrict publishing access to trusted publishing / 2FA as appropriate for your account policy.
3. Remove any old publish-capable npm automation tokens that are no longer needed.

If this repo later needs private npm dependencies during CI, add a separate read-only install token for `pnpm install`. Trusted publishing only covers `npm publish` / `pnpm publish`.

## First Release Checklist

1. Confirm [publish-npm.yml](../../.github/workflows/publish-npm.yml) is on the default branch.
2. Confirm the trusted publisher entry on npm matches `publish-npm.yml` exactly.
3. Confirm the package version has been bumped and committed.
4. Push the release tag, for example `v0.4.1`.
5. Verify the GitHub Actions run publishes successfully to npmjs.
6. After the publish is visible on npmjs, update README install guidance if npmjs should become the primary documented install path.
