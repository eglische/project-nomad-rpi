# Fork Publish Notes

## Local State

- local repo path: `/home/manager/github/project-nomad`
- working branch: `main`
- target GitHub repo: `https://github.com/eglische/project-nomad-rpi`

## Recommended Remote Layout

When your GitHub repo exists, convert the repo to the standard layout:

```bash
cd /home/manager/github/project-nomad
git remote rename origin upstream
git remote add origin git@github.com:eglische/project-nomad-rpi.git
git push -u origin main
```

If you prefer HTTPS:

```bash
git remote add origin https://github.com/eglische/project-nomad-rpi.git
git push -u origin main
```

## Installer Fork Variables

The installer no longer needs hard-coded Crosstalk raw URLs.

It now derives installer asset URLs from:

- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_REPO_BRANCH`

Current defaults:

- owner: `eglische`
- repo: `project-nomad-rpi`
- branch: `main`

## Switching Installer Downloads To The Fork

Once your fork is pushed, either:

1. change the defaults in `install/install_nomad.sh`, or
2. export variables before running the installer

Example:

```bash
export GITHUB_REPO_OWNER=eglische
export GITHUB_REPO_NAME=project-nomad-rpi
export GITHUB_REPO_BRANCH=main
bash install/install_nomad.sh --preinstall-only
```

That will make the installer download:

- `management_compose.yaml`
- `entrypoint.sh`
- helper scripts
- sidecar updater files

from your repository `main` branch instead of upstream `main`.

## Next Fork-Side Tasks

- push `main` to your GitHub repo
- repoint installer defaults if you want fork-first behavior baked into the script
- adapt `install/management_compose.yaml` and related assets in the fork
- continue arm64 image replacement and storage split changes on `main`
