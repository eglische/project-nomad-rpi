# Work Log

## 2026-03-17

### Local fork preparation

- Created local fork workspace at `/home/manager/github/project-nomad`
- Cloned upstream `Crosstalk-Solutions/project-nomad`

### Target Pi cleanup

- Audited existing AI services on `192.168.1.14`
- Disabled and stopped:
  - `llama-server.service`
  - `whisper-live.service`
  - `f5-tts-english.service`
  - `f5-tts-german.service`
  - `tee-mux-5037.service`
  - `qwen-tts.service`
  - `whisper-stt.service`
  - `xtts-api.service`
  - `tts-gatekeeper-f5.service`
  - `tts-gatekeeper-xtts.service`
- Removed old AI service files, old model payloads, old venv payloads, and old AI source trees

### Target Pi storage

- Confirmed:
  - `/mnt/usb` is legacy ext4 USB storage with `swapfile`
  - `/dev/sdb1` was a 931.5G NTFS disk
- Reformatted `/dev/sdb1` as ext4 with label `nomad-data`
- Mounted new disk at `/mnt/nomad-data`
- Added persistent `/etc/fstab` entry:
  - `UUID=7ee7f600-a8f6-43f5-9a89-90e0f4c1a5ea /mnt/nomad-data ext4 defaults,noatime 0 2`
- Left `/mnt/usb/swapfile` intact because USB-backed swap still makes sense for LLM pressure on a Pi

### Runtime and GPU history audit

- Found original machine build notes in:
  - `~/Documents/airig_build_log.txt`
  - `~/Documents/airig_install.sh`
  - `~/Documents/010126_project.txt`
- Extracted critical runtime findings:
  - NVIDIA requires 4K pages on this Pi/eGPU setup
  - `/boot/firmware/config.txt` uses `kernel=kernel8.img`
  - GPU stack is custom runfile/open-module based, not package-managed
  - `/etc/profile.d/cuda.sh` sets CUDA PATH/LD_LIBRARY_PATH
  - `/etc/apt/preferences.d/nvidia-block` protects the custom NVIDIA stack

### Installer adaptation

- Patched local `install/install_nomad.sh` to introduce a dedicated runtime-preinstall stage
- Added:
  - platform detection
  - runtime prerequisite installation
  - Raspberry Pi NVIDIA sanity checks
  - Docker Compose plugin verification
  - NVIDIA toolkit APT preference override
  - reusable Docker NVIDIA runtime configuration
- Verified installer syntax with `bash -n`

### Remaining work after this log entry

- Execute and validate runtime preinstall on the Pi
- Confirm Docker + NVIDIA passthrough with container test
- Redirect installer asset URLs to fork-controlled files
- Build/replace arm64-incompatible upstream images
- Adapt storage paths for Nomad data split

### Runtime preinstall validation

- Added `--preinstall-only` mode to `install/install_nomad.sh` so runtime validation can be executed without launching the full Nomad stack
- Added `--preflight-only` mode for a report-only runtime gate
- Added persistent installer logging to `~/project-nomad-install-logs/install-<timestamp>.log`
- Added command-failure trap output so logs point to the failing command and likely causes
- Re-ran the installer preinstall stage directly on `airig`
- Confirmed:
  - Docker installed and active
  - Docker Compose plugin available
  - NVIDIA container toolkit installed from NVIDIA's arm64 repo
  - toolkit APT override file created to coexist with the machine's protective `nvidia-block` pin
  - `/etc/docker/daemon.json` contains the `nvidia` runtime
- Found and fixed a validation bug:
  - installer was checking `docker info` without daemon access
  - `manager` was not yet in the `docker` group
  - this produced a false negative even though the runtime was configured
- Updated installer to:
  - add the invoking user to the `docker` group
  - verify runtime registration through a sudo-backed helper
- Confirmed a fresh SSH session now places `manager` in group `docker`
- Confirmed Docker sees runtime `nvidia`
- Confirmed real GPU passthrough in-container with:
  - `docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi`
- Observed successful container GPU result:
  - `NVIDIA GeForce RTX 4060 Ti`
  - driver `580.95.05`
- Added a blocking runtime preflight stage that now runs after preinstall and before Nomad startup
- Verified on-host log creation and successful preflight output on `airig`:
  - root free space
  - Docker service
  - Docker Compose version
  - GPU host check
  - NVIDIA toolkit version
  - Docker runtime status
  - `/mnt/nomad-data` free space
  - container GPU smoke test

### GitHub preparation

- Temporary branch was removed; work now continues on `main`
- Updated installer URL handling so raw asset downloads are derived from:
  - `GITHUB_REPO_OWNER`
  - `GITHUB_REPO_NAME`
  - `GITHUB_REPO_BRANCH`
- This allows the installer to be pointed at a future fork without another hard-coded URL rewrite
- Updated repo-target defaults to:
  - `eglische/project-nomad-rpi`
  - installer branch default `main`

### External storage automation

- Extended `install/install_nomad.sh` to support external-disk preparation for full installs
- Added interactive/flag-driven storage options:
  - `--external-device`
  - `--external-mount`
  - `--external-label`
  - `--format-external-disk`
  - `--assume-yes`
  - `--storage-only`
- Full install flow now prepares the external storage before the blocking runtime preflight
- Updated compose templating so stateful paths are redirected from local `/opt/project-nomad/...` data dirs to:
  - `/mnt/nomad-data/project-nomad/storage`
  - `/mnt/nomad-data/project-nomad/mysql`
  - `/mnt/nomad-data/project-nomad/redis`
- Tested storage automation directly on `airig` with:
  - `--storage-only --assume-yes --format-external-disk --external-device /dev/sdb1 --external-mount /mnt/nomad-data --external-label nomad-data`
- Verified result:
  - `/dev/sdb1` reformatted and mounted at `/mnt/nomad-data`
  - data root created at `/mnt/nomad-data/project-nomad`
  - runtime preflight passed with the external storage present
