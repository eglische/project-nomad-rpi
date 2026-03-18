# Raspberry Pi 5 eGPU Porting Notes

## Scope

This fork is adapting Project N.O.M.A.D. to run on a Raspberry Pi 5 with:

- Debian 13 `arm64`
- NVIDIA eGPU
- RTX 4060 Ti 16GB
- local LLM acceleration
- large external USB storage for knowledge/content data

The target behavior is:

- Nomad core stack runs on the Pi
- Docker and NVIDIA container runtime are installed and validated on the Pi
- Nomad content and knowledge storage live on the external data disk
- the AI runtime uses local GPU acceleration
- unsupported upstream `amd64` image assumptions are replaced with `arm64`-compatible builds or alternatives

## Current Target Machine

Host: `airig`
IP: `192.168.1.14`
OS: Debian GNU/Linux 13 (`trixie`)
Kernel: `6.12.47+rpt-rpi-v8`
Architecture: `aarch64`

Storage:

- root/OS: `mmcblk0p2`
- legacy USB ext4 + swapfile: `sda1` mounted at `/mnt/usb`
- new Nomad data disk: `sdb1` mounted at `/mnt/nomad-data`

GPU/runtime:

- GPU detected by `nvidia-smi`: `NVIDIA GeForce RTX 4060 Ti`
- page size: `4096`
- boot override present: `/boot/firmware/config.txt` includes `kernel=kernel8.img`
- CUDA env file present: `/etc/profile.d/cuda.sh`
- apt pin present: `/etc/apt/preferences.d/nvidia-block`

## Critical Findings From Prior GPU Build

These came from `~/Documents/airig_build_log.txt` and live runtime inspection.

### 1. 4K pages are required

The NVIDIA eGPU setup on this Pi did not work correctly with the default 16K page kernel.

Known-good state:

- `getconf PAGESIZE` returns `4096`
- `/boot/firmware/config.txt` under `[pi5]` uses `kernel=kernel8.img`
- running kernel is `rpt-rpi-v8`

This is a hard prerequisite for the current NVIDIA setup.

### 2. NVIDIA was installed outside apt

The working stack was built from NVIDIA runfiles/open kernel module flow, not from Debian packages.

Known-good references from the build log:

- NVIDIA driver/userland: `580.95.05`
- CUDA toolkit: `12.4`

Implication:

- `dpkg -l` is not a reliable source of truth for the GPU stack
- the install path must preserve, not replace, the custom NVIDIA/CUDA setup

### 3. APT pin blocks Debian NVIDIA packages

The machine has `/etc/apt/preferences.d/nvidia-block`:

- blocks `nvidia-*`
- blocks `libnvidia-*`
- blocks `libcuda1`
- blocks `nvidia-smi`
- blocks `firmware-nvidia-gsp`

This is correct for protecting the custom 580 stack from Debian package drift.

However, this also blocks:

- `nvidia-container-toolkit`
- `libnvidia-container*`

So the Nomad installer must add an explicit APT preference override for NVIDIA container toolkit packages before trying to install them.

### 4. Docker is not currently installed

At the start of this porting work:

- `docker` was absent
- `docker compose` was absent
- `nvidia-ctk` was absent

So the preinstall phase must provision the full container runtime from scratch on the Pi.

## Upstream Nomad Installer Notes

Upstream `install/install_nomad.sh` already had the right broad sequence:

1. install Docker
2. install NVIDIA container toolkit
3. configure runtime
4. download compose/assets
5. start Nomad core containers

What was missing for this Pi:

- Raspberry Pi platform detection
- 4K page/kernel sanity check
- runtime prerequisite installation (`jq`, `pciutils`, `gnupg`, etc.)
- Docker Compose plugin validation
- handling of existing `nvidia-ctk`
- APT override for the pinned NVIDIA container toolkit packages

## Local Fork Installer Changes

The local fork now includes these additions in `install/install_nomad.sh`:

- `detect_target_platform`
- `ensure_runtime_prerequisites_installed`
- `ensure_raspberry_pi_nvidia_prerequisites`
- `ensure_docker_compose_available`
- `ensure_docker_group_access`
- `prepare_nvidia_container_toolkit_apt_preferences`
- `configure_nvidia_container_runtime`
- `docker_runtime_is_configured`
- `run_platform_runtime_preinstall`

Main behavioral changes:

- preinstall is now a named runtime stage
- installer supports `--preinstall-only` for isolated validation
- installer supports `--preflight-only` for a report-only gate before Nomad startup
- Raspberry Pi/NVIDIA prerequisites are checked before Nomad compose work
- installer no longer exits early just because `nvidia-ctk` already exists
- installer can override the machine's protective NVIDIA apt pin for toolkit-only packages
- installer adds the invoking user to the `docker` group for future non-sudo Docker access
- runtime verification now uses daemon-accessible Docker inspection instead of a user-session false negative
- installer writes a persistent log file under `~/project-nomad-install-logs/`
- installer traps command failures and reports likely causes plus the log location
- installer runs a blocking runtime preflight after preinstall and before Nomad startup

## Preinstall Validation Results

Validated on target host `airig` on `2026-03-17`.

### Runtime packages

- Docker installed and active:
  - `Docker version 29.3.0`
- Docker Compose plugin installed:
  - `Docker Compose version v5.1.0`
- NVIDIA container toolkit installed:
  - `nvidia-container-toolkit 1.19.0`

### Docker/NVIDIA wiring

- `/etc/apt/preferences.d/nomad-nvidia-container-toolkit` was created to override the broad `nvidia-block` pin for toolkit packages only
- `/etc/docker/daemon.json` now includes the `nvidia` runtime definition
- `docker info` shows:
  - `Runtimes: ... nvidia ...`
  - `Default Runtime: runc`

Important note:

- `Default Runtime` remaining `runc` is acceptable
- Nomad/Ollama GPU use can still work with `--gpus all`
- we do not need to force `nvidia` as the global default runtime unless a later container definition specifically requires that behavior

### GPU passthrough test

Containerized GPU access was validated successfully with:

- `docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi`

Observed result:

- container reported `NVIDIA GeForce RTX 4060 Ti`
- container reported driver `580.95.05`

This confirms the Pi's custom NVIDIA stack is usable from Docker containers.

### Installer logging and sanity behavior

The installer now records the full run to a timestamped log file:

- `~/project-nomad-install-logs/install-YYYYMMDD-HHMMSS.log`

The runtime preflight prints and logs:

- platform and architecture
- repo owner/name/branch source
- root free space
- Docker service state
- Docker Compose version
- host GPU/driver details
- NVIDIA container toolkit version
- Docker runtime registration
- `/mnt/nomad-data` capacity, when present
- containerized GPU smoke test result

The preflight blocks startup if critical runtime checks fail.

## External Storage Workflow

The installer now assumes:

- OS and runtime files stay local
- Nomad stateful data lives on an external disk

Current managed layout:

- local runtime/config/scripts: `/opt/project-nomad`
- external data root: `/mnt/nomad-data/project-nomad`
- external storage paths used by compose:
  - `storage`
  - `mysql`
  - `redis`

### Interactive behavior

For a full install, the script now:

1. detects candidate external partitions
2. prompts the user to choose one if `--external-device` is not supplied
3. confirms destructive formatting
4. formats the selected partition as ext4
5. mounts it
6. writes/updates the `fstab` entry
7. creates the Nomad data directories
8. blocks preflight if that storage path is missing

### Automation flags

## Current Working State As Of 2026-03-18

- Fresh GitHub-driven installation has been validated end-to-end on `airig`
- Nomad core management stack comes online on the Pi
- arm64 service handling is now explicitly accounted for in the fork
- external content/data storage is mounted at `/mnt/nomad-data`
- AI runtime works with the RTX 4060 Ti through Docker/Ollama
- Kiwix serves downloaded `.zim` files correctly from the Nomad data path

Verified live behaviors:

- `http://127.0.0.1:8080/api/health` returns `{"status":"ok"}`
- CyberChef now uses upstream `arm64` image support
- Kolibri uses the known-good upstream `arm64` tag path for the Pi
- stale Kiwix ZIM URLs can now be resolved to current live versions
- `/settings/system` exposes live activity, diagnostics, and user-facing recovery actions

## Current Operational Risks

### 1. Root SD pressure

The Pi root filesystem is almost full and has already remounted read-only once during this work session.

Observed state:

- `/dev/mmcblk0p2` is roughly `98%` used
- Docker failed when `/` became read-only because `/var/lib/docker` lives on the root disk

Implication:

- the external Nomad data disk is healthy, but root-SD pressure can still take the whole system down

### 2. Root filesystem instability is now a real risk

During this session:

- `/` remounted read-only
- Docker failed to start because `/var/lib/docker` was not writable
- Nomad recovered only after:
  - remounting `/` read-write
  - restarting Docker
  - restarting the Nomad stack

This did not look like an external HDD failure. It looked like a host/root filesystem event.

### 3. GitHub lag remains a deployment risk

Many fixes in this fork were validated live on the Pi before being pushed upstream to the fork repo.

Implication:

- if local changes are not pushed promptly, a future GitHub-driven reinstall can regress to older behavior

## ZIM Source Resilience Direction

The fork no longer should rely on brittle hardcoded Kiwix file URLs alone.

The current direction now implemented locally is:

- resolve Kiwix downloads by stable `resource_id`
- derive the current live `.zim` file/version from the repository directory
- retry once on `404` with the newly resolved live file

Confirmed live examples:

- `wikipedia_en_all_maxi_2024-01.zim` resolves to `wikipedia_en_all_maxi_2026-02.zim`
- `devdocs_en_react_2026-01.zim` resolves to `devdocs_en_react_2026-02.zim`

This should remain the preferred design going forward.

## Remote Explorer Direction

The original `/settings/zim/remote-explorer` was too narrow for real-world content management.

The new local direction is:

- keep curated packs for easy installs
- expose multiple remote-source modes for normal users and power users

Current source modes implemented locally:

- `Kiwix Catalog`
  - searchable metadata-driven discovery
- `Kiwix Repository Browser`
  - raw repository exploration at `https://download.kiwix.org/zim/`
- `Direct URL Import`
  - user-supplied `.zim` URLs, including mirrors or manually discovered content

This is the preferred UX direction for future work because it:

- explains what each source actually is
- avoids hiding the raw upstream repository
- gives users a fallback when catalog entries are stale or incomplete

## Follow-up Work For Next Session

- push the locally validated fixes to GitHub so reinstall paths stay aligned with the live Pi
- decide what can be safely removed from the root SD to reduce pressure
- consider moving more runtime payload off the root SD if repeat read-only events occur
- continue improving the remote explorer with:
  - better per-source help text
  - optional mirror support
  - user-editable source overrides
- continue the diagnostics/reconciliation work so host/runtime failures are surfaced more clearly in the frontend

The installer now supports:

- `--external-device /dev/sdX1`
- `--external-mount /mnt/nomad-data`
- `--external-label nomad-data`
- `--format-external-disk`
- `--assume-yes`
- `--storage-only`

`--storage-only` is useful for testing the external-disk flow without launching the full Nomad stack.

### Remaining runtime caveats

- Docker reports:
  - `WARNING: No memory limit support`
  - `WARNING: No swap limit support`
- these are kernel/cgroup capability warnings on this Pi, not a blocker for proceeding with Nomad bring-up
- if later service tuning depends on strict container memory limits, that will need separate platform work

## Known Upstream Porting Constraints

These are not solved by the installer alone.

### Upstream admin image architecture

Published upstream images checked so far:

- upstream `ghcr.io/crosstalk-solutions/project-nomad:latest` -> `amd64` only
- upstream `ghcr.io/crosstalk-solutions/project-nomad-disk-collector:latest` -> `amd64` only
- `ghcr.io/gchq/cyberchef:10.19.4` -> `amd64` only

Implication:

- arm64 images must be built or replaced in this fork

### AI backend expectation

Nomad backend is not generic for LLM serving. It is explicitly built against:

- `Ollama`
- `Qdrant`

So the clean path is to support GPU-backed Ollama in Docker, not to keep the previous `llama.cpp` server as Nomad's main AI backend.

### Storage split requirement

Desired layout:

- local disk: AI runtime/model storage
- `/mnt/nomad-data`: KB/content/vector/document storage

Upstream defaults everything under `/opt/project-nomad/storage`, so this fork will need storage-path adaptation.

## Immediate Next Steps

1. Point the installer's GitHub repo variables at the eventual fork instead of upstream defaults.
2. Replace/build arm64-incompatible images.
3. Adapt Nomad service definitions so model storage also lands on the selected external disk where desired.
4. Update management compose and related installer assets to use the fork-controlled service definitions.

## Deferred TODOs

### Maps catalog redesign for non-US deployments

Current state:

- Nomad's offline maps system can load arbitrary `.pmtiles` regions, but the curated catalog in `collections/maps.json` is currently US-centric.
- The shipped collections are grouped into US regional buckets such as `Pacific Region`, `Mountain Region`, and `New England`.
- Region files are relatively large because many entries are state-scale extracts.

Deferred work:

- redesign the maps manifest away from flat US-region collections and toward a geography-first structure
- categorize maps by continent / macro-region first, then by country, then by subregion where needed
- replace oversized state-scale defaults with smaller country-, province-, or metro-scale PMTiles where that makes sense
- audit candidate international offline map sources and extract pipelines so Europe, Asia, Africa, South America, Oceania, and non-US North America can be offered cleanly
- update Easy Setup and Maps Manager UI flows to browse by nation/region instead of US-only regional groupings

Rationale:

- the current renderer/backend is not the blocker; the limitation is the curated catalog shape and the source dataset selection
- this should be handled after the core Raspberry Pi arm64 install path and service compatibility work is stable

### RAG indexing and ZIM library expansion

Current state:

- Nomad chat does not query the running Kiwix server directly; it relies on the RAG pipeline.
- ZIM files and other documents must be discovered, extracted, chunked, embedded, and written into Qdrant before chat can use them.
- The current implementation works, but ownership of the full indexing flow, update path, and content-expansion workflow still needs deeper review.

Deferred work:

- trace the full RAG indexing pipeline end to end, including file discovery, ZIM extraction, chunking, embedding, queueing, and retrieval
- document how background embedding jobs are scheduled, retried, resumed, and surfaced in the UI
- determine how to take over and extend the indexing flow so new library content can be added and indexed on demand
- design a clean way to create or refresh library indexes on the fly when new ZIM content is dropped into storage
- audit how prepacks and manually added ZIM files should be discovered and merged into the searchable knowledge base
- identify how to search for, evaluate, and add new ZIM sources so the library can be expanded in a controlled way
- define a repeatable workflow for finding useful new Kiwix/OpenZIM content, importing it, indexing it, and verifying that chat retrieval actually uses it

Rationale:

- the Kiwix content itself is only half the system; usable chat over that content depends on a reliable, understandable RAG ingestion path
- before expanding the library significantly, the indexing pipeline should be understood well enough to operate, tune, and extend without guesswork
