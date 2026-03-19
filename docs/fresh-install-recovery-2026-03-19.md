# Fresh Install Recovery Notes (2026-03-19)

Target host for this pass:

- `manager@192.168.1.47`
- hostname: `base`
- OS: Debian 13 (`trixie`)
- architecture: `arm64`

## Host state before Nomad install

- root disk:
  - `/dev/mmcblk0`
  - mounted on `/`
- recovery data disk:
  - `/dev/sda1`
  - label: `nomad-data`
  - ext4
  - previous mount history indicates it was used as `/storage`
- second USB partition:
  - `/dev/sdb1`
  - ext4
  - previous mount history indicates `/mnt/usb`
- no NVIDIA userspace detected yet:
  - no `nvidia-smi`
  - no `nvidia-ctk`
  - no installed CUDA/container-toolkit packages visible via `dpkg -l`

## Fresh-install requirements captured from this target

### External storage safety

The installer must assume recovery is a first-class use case.

Requirements:

- never format an external partition by default
- prefer reusing an existing ext4 Nomad data partition
- recognize an existing recovery partition by:
  - ext4 label `nomad-data`, and/or
  - existing `project-nomad` directory or install metadata on disk
- make recovery-safe reuse the default path
- require an explicit destructive override before formatting a partition that already looks like Nomad data

Implemented locally in `install/install_nomad.sh`:

- guided disk selection now annotates recovery-looking disks with:
  - `nomad-label`
  - `existing-nomad-data`
- the guided selector recommends the detected recovery disk
- formatting an existing recovery disk is now refused unless:
  - `--format-external-disk`
  - and `--force-format-existing-nomad-data`

### arm64 without CUDA/NVIDIA preinstalled

This host currently represents the "plain arm64 Pi install" path:

- Raspberry Pi / arm64 is detected
- Docker/runtime prerequisites can still be installed
- GPU-specific setup should remain opportunistic, not blocking, when no NVIDIA stack is present

Current installer behavior is acceptable here:

- it checks for NVIDIA presence
- if no NVIDIA GPU/userspace is detected, it skips container-toolkit setup
- it only blocks on GPU preflight when a Pi/NVIDIA setup is actually present

Additional Pi 5 requirement captured during validation:

- Raspberry Pi 5 default 16K-page kernels break the current arm64 Qdrant path
- the known-good Pi 5 AI/NVIDIA path requires the 4K kernel via:
  - `[pi5]`
  - `kernel=kernel8.img`
- the installer must now stage that override early and stop for a reboot before continuing when Pi 5 is still on 16K pages

What still needs to be validated on this clean host:

- whether the management stack comes online cleanly without any CUDA stack present
- whether Ollama behaves acceptably in CPU-only mode until GPU support is added later
- whether any Pi/arm64 service-selection logic still assumes GPU availability too early

## Reinstall / recovery expectations

For a recovery install on a host like this:

1. the installer should reuse `/dev/sda1`
2. it should mount it at `/mnt/nomad-data`
3. it should preserve existing `.zim`, Kolibri, and other data under `project-nomad`
4. it should rebuild the management layer around that preserved data
5. it should not touch unrelated USB partitions unless explicitly chosen

## Post-install recovery UX requirement

When preserved data exists but the Nomad metadata database has to be reset, the UI needs a second-stage recovery flow.

Required behavior:

- after first login, scan preserved storage for recognizable app data
- if recoverable data is found, prompt the user with:
  - previous Project N.O.M.A.D. data found
  - choose which services to reconnect
- reuse the normal Docker install logic to reattach those services
- expose the same recovery menu later under system settings so recovery can be run again on demand

Implemented locally in the admin layer:

- backend recovery scan/import service
- `GET /api/system/recovery`
- `POST /api/system/recovery/import`
- automatic recovery prompt on `/home`
- recovery button and same modal on `/settings/system`
- diagnostics now warn when preserved service data is present but not yet imported

Additional runtime behavior implemented locally:

- if Docker advertises an NVIDIA runtime but the host NVIDIA userspace stack is still incomplete, Ollama now falls back to CPU instead of failing installation outright
- this keeps AI reachability working on fresh recovery cards while the GPU stack is still being prepared

## Out-of-scope local setup note

- keeping the machine on `.14` instead of `.47` is a local network/admin concern, not a Nomad code change

## Local admin changes applied on the fresh host

These were applied on the host after Nomad install and are intentionally separate from Nomad itself:

- `eth0` was moved to static `192.168.1.14/24`
- gateway set to `192.168.1.1`
- `wlan0` was left enabled on DHCP as a secondary path
- USB stick `/dev/sdb1` was mounted at `/mnt/usb-swap`
- swap was reinitialized on `/mnt/usb-swap/swapfile`
- active post-reboot swap layout:
  - `zram0`
  - `/mnt/usb-swap/swapfile`

Important separation:

- Nomad recovery/data disk remains `/dev/sda1`
- USB swap remains `/dev/sdb1`
- the swap integration must not be confused with the Nomad external data mount
