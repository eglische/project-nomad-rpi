#!/bin/bash

set -E -o pipefail

# Project N.O.M.A.D. Installation Script

###################################################################################################################################################################################################

# Script                | Project N.O.M.A.D. Installation Script
# Version               | 1.0.0
# Author                | Crosstalk Solutions, LLC
# Website               | https://crosstalksolutions.com

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Color Codes                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
WHITE_R='\033[39m' # Same as GRAY_R for terminals with white background.
GRAY_R='\033[39m'
RED='\033[1;31m' # Light Red.
GREEN='\033[1;32m' # Light Green.

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Constants & Variables                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

WHIPTAIL_TITLE="Project N.O.M.A.D Installation"
NOMAD_DIR="/opt/project-nomad"
NOMAD_EXTERNAL_MOUNT_DEFAULT="/mnt/nomad-data"
NOMAD_EXTERNAL_LABEL_DEFAULT="nomad-data"
GITHUB_REPO_OWNER="${GITHUB_REPO_OWNER:-eglische}"
GITHUB_REPO_NAME="${GITHUB_REPO_NAME:-project-nomad-rpi}"
GITHUB_REPO_BRANCH="${GITHUB_REPO_BRANCH:-main}"
GITHUB_RAW_BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/refs/heads/${GITHUB_REPO_BRANCH}"
GITHUB_ARCHIVE_URL="https://codeload.github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/tar.gz/refs/heads/${GITHUB_REPO_BRANCH}"
MANAGEMENT_COMPOSE_FILE_URL="${GITHUB_RAW_BASE_URL}/install/management_compose.yaml"
ENTRYPOINT_SCRIPT_URL="${GITHUB_RAW_BASE_URL}/install/entrypoint.sh"
SIDECAR_UPDATER_DOCKERFILE_URL="${GITHUB_RAW_BASE_URL}/install/sidecar-updater/Dockerfile"
SIDECAR_UPDATER_SCRIPT_URL="${GITHUB_RAW_BASE_URL}/install/sidecar-updater/update-watcher.sh"
START_SCRIPT_URL="${GITHUB_RAW_BASE_URL}/install/start_nomad.sh"
STOP_SCRIPT_URL="${GITHUB_RAW_BASE_URL}/install/stop_nomad.sh"
UPDATE_SCRIPT_URL="${GITHUB_RAW_BASE_URL}/install/update_nomad.sh"
WAIT_FOR_IT_SCRIPT_URL="https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh"
INSTALL_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
INSTALL_LOG_DIR="${HOME}/project-nomad-install-logs"
INSTALL_LOG_FILE="${INSTALL_LOG_DIR}/install-${INSTALL_TIMESTAMP}.log"
warnings_detected=0
preflight_failures=0
boot_order_update_applied='false'

script_option_debug='true'
accepted_terms='false'
local_ip_address=''
target_architecture="$(dpkg --print-architecture 2>/dev/null || uname -m)"
target_platform='generic'
preinstall_only='false'
preflight_only='false'
storage_only='false'
skip_storage_preflight='false'
assume_yes='false'
format_external_disk='false'
external_device=''
external_mount="${NOMAD_EXTERNAL_MOUNT_DEFAULT}"
external_label="${NOMAD_EXTERNAL_LABEL_DEFAULT}"
nomad_data_root=''
source_repo_dir=''

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Functions                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

header() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${GREEN}#########################################################################${RESET}\\n"
}

header_red() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${RED}#########################################################################${RESET}\\n"
}

setup_logging() {
  mkdir -p "${INSTALL_LOG_DIR}"
  touch "${INSTALL_LOG_FILE}"
  exec > >(tee -a "${INSTALL_LOG_FILE}") 2>&1

  echo "================================================================="
  echo "Project N.O.M.A.D installer log"
  echo "Started: $(date --iso-8601=seconds)"
  echo "Log file: ${INSTALL_LOG_FILE}"
  echo "Repository source: ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${GITHUB_REPO_BRANCH}"
  echo "Host: $(hostname)"
  echo "User: $(whoami)"
  echo "================================================================="
}

record_warning() {
  warnings_detected=$((warnings_detected + 1))
  echo -e "${YELLOW}#${RESET} Warning: $1"
}

record_preflight_failure() {
  preflight_failures=$((preflight_failures + 1))
  echo -e "${RED}#${RESET} Preflight failure: $1"
}

log_error_context() {
  local exit_code="$1"
  local line_number="$2"
  local command_text="$3"

  echo -e "${RED}#${RESET} Installer command failed with exit code ${WHITE_R}${exit_code}${RESET} at line ${WHITE_R}${line_number}${RESET}."
  echo -e "${RED}#${RESET} Last command: ${WHITE_R}${command_text}${RESET}"
  echo -e "${YELLOW}#${RESET} Review the installer log at ${WHITE_R}${INSTALL_LOG_FILE}${RESET} for the surrounding output."
  echo -e "${YELLOW}#${RESET} Common causes: missing network access, package repository issues, insufficient sudo rights, or a stale/custom runtime configuration."
}

print_log_location() {
  echo -e "${YELLOW}#${RESET} Installer log: ${WHITE_R}${INSTALL_LOG_FILE}${RESET}\\n"
}

check_has_sudo() {
  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} User has sudo permissions.\\n"
  else
    echo "User does not have sudo permissions"
    header_red
    echo -e "${RED}#${RESET} This script requires sudo permissions to run. Please run the script with sudo.\\n"
    echo -e "${RED}#${RESET} For example: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    header_red
    echo -e "${RED}#${RESET} This script requires bash to run. Please run the script using bash.\\n"
    echo -e "${RED}#${RESET} For example: bash $(basename "$0")"
    exit 1
  fi
    echo -e "${GREEN}#${RESET} This script is running in bash.\\n"
}

check_is_debian_based() {
  if [[ ! -f /etc/debian_version ]]; then
    header_red
    echo -e "${RED}#${RESET} This script is designed to run on Debian-based systems only.\\n"
    echo -e "${RED}#${RESET} Please run this script on a Debian-based system and try again."
    exit 1
  fi
    echo -e "${GREEN}#${RESET} This script is running on a Debian-based system.\\n"
}

ensure_dependencies_installed() {
  local missing_deps=()

  # Check for curl
  if ! command -v curl &> /dev/null; then
    missing_deps+=("curl")
  fi

  # Check for whiptail (used for dialogs, though not currently active)
  # if ! command -v whiptail &> /dev/null; then
  #   missing_deps+=("whiptail")
  # fi

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${YELLOW}#${RESET} Installing required dependencies: ${missing_deps[*]}...\\n"
    sudo apt-get update
    sudo apt-get install -y "${missing_deps[@]}"

    # Verify installation
    for dep in "${missing_deps[@]}"; do
      if ! command -v "$dep" &> /dev/null; then
        echo -e "${RED}#${RESET} Failed to install $dep. Please install it manually and try again."
        exit 1
      fi
    done
    echo -e "${GREEN}#${RESET} Dependencies installed successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} All required dependencies are already installed.\\n"
  fi
}

detect_target_platform() {
  if [[ -f /proc/device-tree/model ]] && grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then
    target_platform='raspberry-pi'
  elif grep -qi "raspberry pi" /sys/firmware/devicetree/base/model 2>/dev/null; then
    target_platform='raspberry-pi'
  else
    target_platform='generic'
  fi

  echo -e "${GREEN}#${RESET} Detected platform: ${WHITE_R}${target_platform}${RESET} (${WHITE_R}${target_architecture}${RESET})\\n"
}

ensure_raspberry_pi_nvidia_prerequisites() {
  if [[ "${target_platform}" != 'raspberry-pi' ]]; then
    return 0
  fi

  local page_size
  page_size="$(getconf PAGESIZE 2>/dev/null || true)"
  local kernel_override=''
  if [[ -f /boot/firmware/config.txt ]]; then
    kernel_override="$(awk '/\[pi5\]/{f=1;next} /^\[/{f=0} f && /^kernel=/{print $0}' /boot/firmware/config.txt | tail -n1)"
  fi

  if command -v nvidia-smi >/dev/null 2>&1; then
    if [[ "$page_size" != "4096" ]]; then
      echo -e "${RED}#${RESET} Raspberry Pi NVIDIA setup detected, but PAGE_SIZE=${page_size}. The known-good setup for this eGPU uses 4K pages."
      echo -e "${RED}#${RESET} Set [pi5] ${WHITE_R}kernel=kernel8.img${RESET} in /boot/firmware/config.txt and reboot before continuing."
      exit 1
    fi

    if [[ "$kernel_override" != "kernel=kernel8.img" ]]; then
      echo -e "${YELLOW}#${RESET} Warning: NVIDIA is present, but /boot/firmware/config.txt does not explicitly set ${WHITE_R}kernel=kernel8.img${RESET} under [pi5]."
      echo -e "${YELLOW}#${RESET} Current detected override: ${WHITE_R}${kernel_override:-<none>}${RESET}\\n"
    fi
  fi
}

ensure_runtime_prerequisites_installed() {
  local missing_deps=()
  local runtime_deps=("ca-certificates" "curl" "gnupg" "jq" "lsb-release" "pciutils")

  for dep in "${runtime_deps[@]}"; do
    if ! dpkg -s "$dep" >/dev/null 2>&1; then
      missing_deps+=("$dep")
    fi
  done

  if [[ ${#missing_deps[@]} -eq 0 ]]; then
    echo -e "${GREEN}#${RESET} Runtime prerequisites are already installed.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Installing runtime prerequisites: ${missing_deps[*]}...\\n"
  sudo apt-get update
  sudo apt-get install -y "${missing_deps[@]}"
  echo -e "${GREEN}#${RESET} Runtime prerequisites installed successfully.\\n"
}

check_is_debug_mode(){
  # Check if the script is being run in debug mode
  if [[ "${script_option_debug}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Debug mode is enabled, the script will not clear the screen...\\n"
  else
    clear; clear
  fi
}

generateRandomPass() {
  local length="${1:-32}"  # Default to 32
  local password

  # Temporarily disable pipefail so head terminating the upstream tr process
  # doesn't turn password generation into a false error.
  set +o pipefail
  password="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length")"
  set -o pipefail

  echo "$password"
}

ensure_docker_installed() {
  if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker not found. Installing Docker...\\n"
    
    # Update package database
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y ca-certificates curl
    
    # Create directory for keyrings
    # sudo install -m 0755 -d /etc/apt/keyrings
    
    # # Download Docker's official GPG key
    # sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    # sudo chmod a+r /etc/apt/keyrings/docker.asc

    # # Add the repository to Apt sources
    # echo \
    #   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    #   $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    #   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # # Update the package database with the Docker packages from the newly added repo
    # sudo apt-get update

    # # Install Docker packages
    # sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Download the Docker convenience script
    curl -fsSL https://get.docker.com -o get-docker.sh

    # Run the Docker installation script
    sudo sh get-docker.sh

    # Check if Docker was installed successfully
    if ! command -v docker &> /dev/null; then
      echo -e "${RED}#${RESET} Docker installation failed. Please check the logs and try again."
      exit 1
    fi
    
    echo -e "${GREEN}#${RESET} Docker installation completed.\\n"
    ensure_docker_group_access
  else
    echo -e "${GREEN}#${RESET} Docker is already installed.\\n"
    
    # Check if Docker service is running
    if ! systemctl is-active --quiet docker; then
      echo -e "${YELLOW}#${RESET} Docker is installed but not running. Attempting to start Docker...\\n"
      sudo systemctl start docker
      if ! systemctl is-active --quiet docker; then
        echo -e "${RED}#${RESET} Failed to start Docker. Please check the Docker service status and try again."
        exit 1
      else
        echo -e "${GREEN}#${RESET} Docker service started successfully.\\n"
      fi
    else
      echo -e "${GREEN}#${RESET} Docker service is already running.\\n"
    fi

    ensure_docker_group_access
  fi
}

ensure_docker_compose_available() {
  if docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}#${RESET} Docker Compose plugin is already available.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Docker Compose plugin not detected. Attempting to install it...\\n"
  sudo apt-get update
  if ! sudo apt-get install -y docker-compose-plugin; then
    echo -e "${RED}#${RESET} Failed to install docker-compose-plugin. Docker is present but compose is unavailable."
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}#${RESET} Docker Compose plugin is still unavailable after installation."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Docker Compose plugin installed successfully.\\n"
}

ensure_docker_group_access() {
  if ! getent group docker >/dev/null 2>&1; then
    return 0
  fi

  if id -nG "$(whoami)" | grep -qw docker; then
    echo -e "${GREEN}#${RESET} User ${WHITE_R}$(whoami)${RESET} is already in the docker group.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Adding ${WHITE_R}$(whoami)${RESET} to the docker group for future non-sudo Docker access...\\n"
  sudo usermod -aG docker "$(whoami)"
  echo -e "${YELLOW}#${RESET} Docker group membership will apply to new login sessions. This installer will continue using sudo-backed Docker checks for now.\\n"
}

docker_runtime_is_configured() {
  sudo docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"nvidia"'
}

get_parent_block_device() {
  local device_path="$1"
  local parent_name=''
  parent_name="$(lsblk -no PKNAME "${device_path}" 2>/dev/null | head -n1)"
  if [[ -n "${parent_name}" ]]; then
    echo "/dev/${parent_name}"
  fi
}

get_root_block_device() {
  local root_source=''
  root_source="$(findmnt -no SOURCE / 2>/dev/null || true)"
  if [[ "${root_source}" == /dev/* ]]; then
    local root_parent=''
    root_parent="$(get_parent_block_device "${root_source}")"
    echo "${root_parent:-${root_source}}"
  fi
}

device_is_system_disk() {
  local device_path="$1"
  local root_device=''
  local candidate_parent=''
  root_device="$(get_root_block_device)"
  candidate_parent="$(get_parent_block_device "${device_path}")"
  [[ -n "${root_device}" && "${root_device}" == "${candidate_parent:-${device_path}}" ]]
}

device_mountpoint() {
  local device_path="$1"
  findmnt -nr -S "${device_path}" -o TARGET 2>/dev/null | head -n1
}

device_hosts_active_swap() {
  local device_path="$1"
  local mountpoint=''
  mountpoint="$(device_mountpoint "${device_path}")"

  while read -r swap_name; do
    [[ -z "${swap_name}" ]] && continue
    if [[ "${swap_name}" == "${device_path}" ]]; then
      return 0
    fi
    if [[ -n "${mountpoint}" && "${swap_name}" == "${mountpoint}/"* ]]; then
      return 0
    fi
  done < <(swapon --noheadings --raw --show=NAME 2>/dev/null || true)

  return 1
}

safe_sd_boot_order_value() {
  if [[ "${target_platform}" == 'raspberry-pi' ]] && grep -qi "Raspberry Pi 5" /proc/device-tree/model 2>/dev/null; then
    echo "0xf461"
  else
    echo "0xf41"
  fi
}

current_boot_order_value() {
  sudo rpi-eeprom-config 2>/dev/null | awk -F= '/^BOOT_ORDER=/{print $2; exit}'
}

apply_safe_boot_order() {
  local desired_boot_order=''
  desired_boot_order="$(safe_sd_boot_order_value)"
  local temp_file=''
  temp_file="$(mktemp)"

  if ! sudo sh -c "rpi-eeprom-config > '${temp_file}'" >/dev/null 2>&1; then
    rm -f "${temp_file}"
    echo -e "${YELLOW}#${RESET} Warning: unable to read current Raspberry Pi EEPROM configuration."
    return 1
  fi

  if grep -q '^BOOT_ORDER=' "${temp_file}"; then
    sed -i "s/^BOOT_ORDER=.*/BOOT_ORDER=${desired_boot_order}/" "${temp_file}"
  else
    printf "\n[all]\nBOOT_ORDER=%s\n" "${desired_boot_order}" >> "${temp_file}"
  fi

  if ! sudo rpi-eeprom-update -d -f "${temp_file}" >/dev/null 2>&1; then
    rm -f "${temp_file}"
    echo -e "${YELLOW}#${RESET} Warning: failed to stage Raspberry Pi bootloader EEPROM update."
    return 1
  fi

  rm -f "${temp_file}"
  boot_order_update_applied='true'
  echo -e "${GREEN}#${RESET} Raspberry Pi bootloader update staged with BOOT_ORDER=${WHITE_R}${desired_boot_order}${RESET}."
  echo -e "${YELLOW}#${RESET} Reboot is required before the new boot order takes effect.\\n"
  return 0
}

ensure_safe_boot_order() {
  if [[ "${target_platform}" != 'raspberry-pi' ]]; then
    return 0
  fi

  if ! command -v rpi-eeprom-config >/dev/null 2>&1 || ! command -v rpi-eeprom-update >/dev/null 2>&1; then
    record_warning "Raspberry Pi EEPROM tools are unavailable. Boot-order safety was not checked."
    return 0
  fi

  local desired_boot_order=''
  local current_boot_order=''
  desired_boot_order="$(safe_sd_boot_order_value)"
  current_boot_order="$(current_boot_order_value || true)"

  if [[ -z "${current_boot_order}" ]]; then
    record_warning "Could not determine current Raspberry Pi boot order."
    return 0
  fi

  if [[ "${current_boot_order}" == "${desired_boot_order}" ]]; then
    echo -e "${GREEN}#${RESET} Raspberry Pi boot order already prefers SD before USB/NVMe: ${WHITE_R}${current_boot_order}${RESET}.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Current Raspberry Pi boot order is ${WHITE_R}${current_boot_order}${RESET}; recommended safe order is ${WHITE_R}${desired_boot_order}${RESET}."
  if confirm_action "Stage a bootloader update so the Pi prefers SD boot before USB/NVMe?"; then
    apply_safe_boot_order || true
  else
    record_warning "Skipped Raspberry Pi boot-order update. USB-attached boot media may still interfere with startup."
  fi
}

refresh_nomad_data_root() {
  nomad_data_root="${external_mount}/project-nomad"
}

source_install_enabled() {
  [[ -n "${source_repo_dir}" ]]
}

copy_or_download_file() {
  local source_path="$1"
  local url="$2"
  local destination_path="$3"
  local description="$4"

  if source_install_enabled && [[ -n "${source_path}" ]]; then
    if [[ ! -f "${source_path}" ]]; then
      echo -e "${RED}#${RESET} Expected local source file for ${description} was not found: ${WHITE_R}${source_path}${RESET}"
      exit 1
    fi

    if ! cp "${source_path}" "${destination_path}"; then
      echo -e "${RED}#${RESET} Failed to copy ${description} from local source checkout."
      exit 1
    fi

    return 0
  fi

  if ! curl -fsSL "${url}" -o "${destination_path}"; then
    echo -e "${RED}#${RESET} Failed to download ${description}. Please check the URL and try again."
    exit 1
  fi
}

prepare_local_build_source_checkout() {
  if source_install_enabled; then
    return 0
  fi

  if [[ "${target_architecture}" != 'arm64' && "${target_architecture}" != 'aarch64' ]]; then
    return 0
  fi

  local source_root="${NOMAD_DIR}/source"
  local extracted_root="${source_root}/${GITHUB_REPO_NAME}-${GITHUB_REPO_BRANCH}"

  echo -e "${YELLOW}#${RESET} Preparing local source checkout for arm64 image builds...\\n"
  sudo mkdir -p "${source_root}"
  sudo chown -R "$(whoami):$(whoami)" "${source_root}"

  rm -rf "${source_root:?}/"*
  mkdir -p "${source_root}"
  if ! curl -fsSL "${GITHUB_ARCHIVE_URL}" | tar -xzf - -C "${source_root}"; then
    echo -e "${RED}#${RESET} Failed to extract source archive for local arm64 builds."
    exit 1
  fi

  if [[ -d "${extracted_root}" ]]; then
    source_repo_dir="${extracted_root}"
  else
    source_repo_dir="$(find "${source_root}" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  fi

  if [[ -z "${source_repo_dir}" || ! -d "${source_repo_dir}" ]]; then
    echo -e "${RED}#${RESET} Unable to locate extracted source checkout under ${WHITE_R}${source_root}${RESET}."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Local source checkout prepared at ${WHITE_R}${source_repo_dir}${RESET}.\\n"
}

write_install_metadata() {
  local metadata_path="${NOMAD_DIR}/install-metadata.env"
  cat > "${metadata_path}" <<EOF
GITHUB_REPO_OWNER='${GITHUB_REPO_OWNER}'
GITHUB_REPO_NAME='${GITHUB_REPO_NAME}'
GITHUB_REPO_BRANCH='${GITHUB_REPO_BRANCH}'
SOURCE_REPO_DIR='${source_repo_dir}'
TARGET_PLATFORM='${target_platform}'
TARGET_ARCHITECTURE='${target_architecture}'
EXTERNAL_MOUNT='${external_mount}'
EOF
  chmod 600 "${metadata_path}"
}

confirm_action() {
  local prompt="$1"

  if [[ "${assume_yes}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Auto-confirm enabled: ${WHITE_R}${prompt}${RESET}"
    return 0
  fi

  read -r -p "${prompt} (y/N): " choice
  case "${choice}" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

select_external_device_interactively() {
  local candidates=()
  local candidate_output=''
  local root_device=''
  root_device="$(get_root_block_device)"

  candidate_output="$(lsblk -rno PATH,TYPE,FSTYPE,LABEL,MOUNTPOINT,SIZE | awk '$2 == "part" { printf "%s|%s|%s|%s|%s\n", $1, $3, $4, $5, $6 }')"

  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    local candidate_device=''
    candidate_device="$(echo "${line}" | cut -d'|' -f1)"
    if device_is_system_disk "${candidate_device}"; then
      continue
    fi
    candidates+=("${line}")
  done <<< "${candidate_output}"

  if [[ ${#candidates[@]} -eq 0 ]]; then
    echo -e "${RED}#${RESET} No external partition candidates were detected."
    echo -e "${YELLOW}#${RESET} Connect and partition the target USB disk first, or pass ${WHITE_R}--external-device /dev/sdX1${RESET}."
    exit 1
  fi

  echo -e "${YELLOW}#${RESET} Select the external partition to use for Project N.O.M.A.D data:"
  local index=1
  local entry=''
  for entry in "${candidates[@]}"; do
    IFS='|' read -r dev fstype label mountpoint size <<< "${entry}"
    local notes=()
    if device_hosts_active_swap "${dev}"; then
      notes+=("active-swap")
    fi
    if [[ -n "${mountpoint}" ]]; then
      notes+=("mounted")
    fi
    printf "  %s) %s size=%s fstype=%s label=%s mount=%s" \
      "${index}" "${dev}" "${size:-<unknown>}" "${fstype:-<none>}" "${label:-<none>}" "${mountpoint:-<none>}"
    if [[ ${#notes[@]} -gt 0 ]]; then
      printf " notes=%s" "$(IFS=,; echo "${notes[*]}")"
    fi
    printf "\n"
    index=$((index + 1))
  done

  if [[ -n "${root_device}" ]]; then
    echo -e "${YELLOW}#${RESET} System boot/root device detected as ${WHITE_R}${root_device}${RESET}. It is excluded from selection."
  fi
  echo -e "${YELLOW}#${RESET} Partitions with active swap should not be selected."

  local selection=''
  while true; do
    read -r -p "Enter selection number: " selection
    if [[ "${selection}" =~ ^[0-9]+$ ]] && (( selection >= 1 && selection <= ${#candidates[@]} )); then
      external_device="$(echo "${candidates[$((selection - 1))]}" | cut -d'|' -f1)"
      break
    fi
    echo -e "${YELLOW}#${RESET} Invalid selection. Choose a number from the list above."
  done

  echo -e "${GREEN}#${RESET} Selected external device: ${WHITE_R}${external_device}${RESET}\\n"
}

configure_external_storage() {
  refresh_nomad_data_root

  if [[ -z "${external_device}" ]]; then
    select_external_device_interactively
  fi

  if [[ ! -b "${external_device}" ]]; then
    echo -e "${RED}#${RESET} External device ${WHITE_R}${external_device}${RESET} was not found."
    exit 1
  fi

  if device_is_system_disk "${external_device}"; then
    echo -e "${RED}#${RESET} Refusing to use ${WHITE_R}${external_device}${RESET} because it is on the current system boot/root device."
    exit 1
  fi

  if device_hosts_active_swap "${external_device}"; then
    echo -e "${RED}#${RESET} Refusing to use ${WHITE_R}${external_device}${RESET} because it currently hosts active swap."
    echo -e "${YELLOW}#${RESET} Keep swap on its own device/path and choose a different partition for Nomad data."
    exit 1
  fi

  ensure_safe_boot_order

  local current_fstype=''
  current_fstype="$(sudo blkid -s TYPE -o value "${external_device}" 2>/dev/null || true)"

  if [[ "${format_external_disk}" == 'true' ]]; then
    if ! confirm_action "Format ${external_device} as ext4 and mount it at ${external_mount}? Existing data on that partition will be lost"; then
      echo -e "${RED}#${RESET} External storage formatting was cancelled."
      exit 1
    fi
  elif [[ "${current_fstype}" != 'ext4' ]]; then
    echo -e "${RED}#${RESET} External device ${WHITE_R}${external_device}${RESET} is not ext4 (detected: ${WHITE_R}${current_fstype:-unknown}${RESET})."
    echo -e "${YELLOW}#${RESET} Re-run with ${WHITE_R}--format-external-disk${RESET} if you want the installer to prepare that partition."
    exit 1
  else
    echo -e "${YELLOW}#${RESET} Reusing existing ext4 filesystem on ${WHITE_R}${external_device}${RESET} without formatting."
  fi

  echo -e "${YELLOW}#${RESET} Preparing external storage device ${WHITE_R}${external_device}${RESET} for Project N.O.M.A.D data...\\n"

  local existing_mountpoint=''
  existing_mountpoint="$(device_mountpoint "${external_device}")"
  if [[ -n "${existing_mountpoint}" ]]; then
    sudo umount "${external_device}" 2>/dev/null || true
  fi

  if [[ "${format_external_disk}" == 'true' ]]; then
    sudo mkfs.ext4 -F -L "${external_label}" "${external_device}"
  fi

  local external_uuid=''
  external_uuid="$(sudo blkid -s UUID -o value "${external_device}")"
  if [[ -z "${external_uuid}" ]]; then
    echo -e "${RED}#${RESET} Unable to determine UUID for ${WHITE_R}${external_device}${RESET} after formatting."
    exit 1
  fi

  sudo mkdir -p "${external_mount}"

  local fstab_entry="UUID=${external_uuid} ${external_mount} ext4 defaults,noatime 0 2"
  if grep -qsE "[[:space:]]${external_mount//\//\\/}[[:space:]]" /etc/fstab; then
    sudo cp /etc/fstab "/etc/fstab.project-nomad-rpi.bak"
    sudo awk -v mountpoint="${external_mount}" '$2 != mountpoint { print }' /etc/fstab | sudo tee /etc/fstab >/dev/null
  fi
  echo "${fstab_entry}" | sudo tee -a /etc/fstab >/dev/null

  sudo mount "${external_mount}"
  refresh_nomad_data_root
  sudo mkdir -p "${nomad_data_root}/storage/logs" "${nomad_data_root}/mysql" "${nomad_data_root}/redis"
  sudo touch "${nomad_data_root}/storage/logs/admin.log"
  sudo chown -R "$(whoami):$(whoami)" "${nomad_data_root}"

  echo -e "${YELLOW}#${RESET} Installer note: Project N.O.M.A.D stores data on ${WHITE_R}${external_device}${RESET} but does not configure USB boot."
  echo -e "${YELLOW}#${RESET} If your Pi firmware ever prefers USB mass storage over the SD card, set Raspberry Pi boot order to prefer SD before USB."
  echo -e "${GREEN}#${RESET} External storage mounted at ${WHITE_R}${external_mount}${RESET} with data root ${WHITE_R}${nomad_data_root}${RESET}.\\n"
}

human_readable_kib() {
  local kib="$1"
  awk -v kib="$kib" 'BEGIN {
    split("KiB MiB GiB TiB", units, " ")
    value = kib + 0
    unit = 1
    while (value >= 1024 && unit < 4) {
      value /= 1024
      unit++
    }
    printf "%.1f %s", value, units[unit]
  }'
}

print_runtime_preflight_report() {
  refresh_nomad_data_root
  local root_available_kib
  root_available_kib="$(df -Pk / | awk 'NR==2{print $4}')"
  local root_available_hr
  root_available_hr="$(human_readable_kib "${root_available_kib:-0}")"
  local docker_service_state
  docker_service_state="$(systemctl is-active docker 2>/dev/null || true)"
  local docker_compose_version='missing'
  if sudo docker compose version >/dev/null 2>&1; then
    docker_compose_version="$(sudo docker compose version --short 2>/dev/null || docker compose version 2>/dev/null | head -n1)"
  fi

  echo -e "\\n${YELLOW}#${RESET} Runtime Preflight Check\\n"
  echo -e "${YELLOW}===========================================${RESET}"
  echo "Platform: ${target_platform} (${target_architecture})"
  echo "Repo source: ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}@${GITHUB_REPO_BRANCH}"
  echo "Root free space: ${root_available_hr}"
  echo "Docker service: ${docker_service_state:-unknown}"
  echo "Docker compose: ${docker_compose_version}"

  if command -v nvidia-smi >/dev/null 2>&1; then
    echo "GPU host check: $(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null | paste -sd '; ' -)"
  else
    echo "GPU host check: nvidia-smi unavailable"
  fi

  if command -v nvidia-ctk >/dev/null 2>&1; then
    echo "NVIDIA toolkit: $(nvidia-ctk --version 2>/dev/null | head -n1)"
  else
    echo "NVIDIA toolkit: missing"
  fi

  if docker_runtime_is_configured; then
    echo "Docker runtime: nvidia available"
  else
    echo "Docker runtime: nvidia missing"
  fi

  echo "External data mount: ${external_mount}"
  echo "Nomad data root: ${nomad_data_root}"

  if findmnt -rn "${external_mount}" >/dev/null 2>&1; then
    echo "Nomad data disk free: $(df -Ph "${external_mount}" | awk 'NR==2{print $4 " of " $2}')"
  fi

  echo -e "${YELLOW}===========================================${RESET}\\n"
}

run_runtime_preflight_checks() {
  preflight_failures=0
  refresh_nomad_data_root

  print_runtime_preflight_report

  local root_available_kib
  root_available_kib="$(df -Pk / | awk 'NR==2{print $4}')"
  if [[ -z "${root_available_kib}" || "${root_available_kib}" -lt 8388608 ]]; then
    record_preflight_failure "Less than 8 GiB free on /. Free additional space before continuing."
  fi

  if ! command -v docker >/dev/null 2>&1; then
    record_preflight_failure "Docker is not installed. The preinstall stage did not complete successfully."
  fi

  if ! systemctl is-active --quiet docker; then
    record_preflight_failure "Docker service is not active. Check 'sudo systemctl status docker' and the installer log."
  fi

  if ! sudo docker compose version >/dev/null 2>&1; then
    record_preflight_failure "Docker Compose plugin is unavailable. Re-run preinstall and inspect package installation output."
  fi

  if [[ "${target_platform}" == 'raspberry-pi' ]] && command -v nvidia-smi >/dev/null 2>&1; then
    local page_size
    page_size="$(getconf PAGESIZE 2>/dev/null || true)"
    if [[ "${page_size}" != '4096' ]]; then
      record_preflight_failure "Raspberry Pi NVIDIA setup is not running with 4K pages. Expected 4096, got ${page_size}."
    fi

    if ! command -v nvidia-ctk >/dev/null 2>&1; then
      record_preflight_failure "NVIDIA container toolkit is missing. Docker GPU passthrough will not work."
    fi

    if ! docker_runtime_is_configured; then
      record_preflight_failure "Docker does not report an nvidia runtime. Check /etc/docker/daemon.json and restart docker."
    fi

    local gpu_smoke_output=''
    if ! gpu_smoke_output="$(sudo docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1)"; then
      record_preflight_failure "Container GPU smoke test failed. Likely causes: broken nvidia-container-runtime wiring, incompatible driver/toolkit state, or Docker runtime regression."
      echo "${gpu_smoke_output}"
    else
      echo -e "${GREEN}#${RESET} Container GPU smoke test passed: ${WHITE_R}${gpu_smoke_output}${RESET}"
    fi
  fi

  if [[ "${skip_storage_preflight}" != 'true' ]]; then
    if ! findmnt -rn "${external_mount}" >/dev/null 2>&1; then
      record_preflight_failure "External data mount ${external_mount} is not mounted. Select and prepare the external drive before continuing."
    else
      local nomad_data_available_kib
      nomad_data_available_kib="$(df -Pk "${external_mount}" | awk 'NR==2{print $4}')"
      if [[ -n "${nomad_data_available_kib}" && "${nomad_data_available_kib}" -lt 52428800 ]]; then
        record_warning "Less than 50 GiB free on ${external_mount}. Large knowledgebase ingestion may stall later."
      fi
    fi

    if [[ ! -d "${nomad_data_root}/storage" || ! -d "${nomad_data_root}/mysql" || ! -d "${nomad_data_root}/redis" ]]; then
      record_preflight_failure "Nomad data directories are missing under ${nomad_data_root}. External storage preparation did not complete."
    fi
  fi

  if [[ ${preflight_failures} -gt 0 ]]; then
    echo -e "${RED}#${RESET} Runtime preflight failed with ${WHITE_R}${preflight_failures}${RESET} blocking issue(s)."
    echo -e "${RED}#${RESET} Nomad will not be started until these are fixed."
    exit 1
  fi

  echo -e "${GREEN}#${RESET} Runtime preflight passed. Proceeding with Nomad installation.\\n"
}

prepare_nvidia_container_toolkit_apt_preferences() {
  local pref_file="/etc/apt/preferences.d/nomad-nvidia-container-toolkit"

  echo -e "${YELLOW}#${RESET} Ensuring APT preferences allow NVIDIA container toolkit packages...\\n"

  cat <<'EOF' | sudo tee "$pref_file" >/dev/null
Package: nvidia-container-toolkit nvidia-container-toolkit-base nvidia-container-runtime libnvidia-container* libnvidia-container-tools
Pin: release *
Pin-Priority: 1001
EOF

  echo -e "${GREEN}#${RESET} NVIDIA container toolkit APT preference override written to ${WHITE_R}${pref_file}${RESET}.\\n"
}

configure_nvidia_container_runtime() {
  echo -e "${YELLOW}#${RESET} Configuring Docker to use NVIDIA runtime...\\n"

  if ! command -v nvidia-ctk &> /dev/null; then
    echo -e "${YELLOW}#${RESET} nvidia-ctk not found. Skipping Docker NVIDIA runtime configuration.\\n"
    return 0
  fi

  if ! sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} nvidia-ctk configure failed, attempting manual configuration...\\n"

    local daemon_json="/etc/docker/daemon.json"
    local config_success=false

    if [[ -f "$daemon_json" ]]; then
      sudo cp "$daemon_json" "${daemon_json}.backup" 2>/dev/null || true

      if ! grep -q '"nvidia"' "$daemon_json" 2>/dev/null; then
        if command -v jq &> /dev/null; then
          if sudo jq '. + {"runtimes": {"nvidia": {"path": "nvidia-container-runtime", "runtimeArgs": []}}}' "$daemon_json" > /tmp/daemon.json.tmp 2>/dev/null; then
            if sudo mv /tmp/daemon.json.tmp "$daemon_json" 2>/dev/null; then
              config_success=true
            fi
          fi
          sudo rm -f /tmp/daemon.json.tmp 2>/dev/null || true
        else
          echo -e "${YELLOW}#${RESET} jq not available, skipping manual daemon.json configuration...\\n"
        fi
      else
        config_success=true
      fi
    else
      if echo '{"runtimes":{"nvidia":{"path":"nvidia-container-runtime","runtimeArgs":[]}}}' | sudo tee "$daemon_json" > /dev/null 2>&1; then
        config_success=true
      fi
    fi

    if ! $config_success; then
      echo -e "${YELLOW}#${RESET} Manual daemon.json configuration unsuccessful. GPU support may require manual setup.\\n"
    fi
  fi

  echo -e "${YELLOW}#${RESET} Restarting Docker service...\\n"
  if ! sudo systemctl restart docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to restart Docker service. You may need to restart it manually.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Verifying NVIDIA runtime configuration...\\n"
  sleep 2

  if docker_runtime_is_configured; then
    echo -e "${GREEN}#${RESET} NVIDIA runtime successfully configured and verified.\\n"
  else
    echo -e "${YELLOW}#${RESET} Warning: NVIDIA runtime not detected in Docker info. GPU acceleration may not work.\\n"
    echo -e "${YELLOW}#${RESET} You may need to manually configure /etc/docker/daemon.json and restart Docker.\\n"
  fi

  echo -e "${GREEN}#${RESET} NVIDIA container runtime configuration completed.\\n"
}

setup_nvidia_container_toolkit() {
  # This function attempts to set up NVIDIA GPU support but is non-blocking
  # Any failures will result in warnings but will NOT stop the installation process
  
  echo -e "${YELLOW}#${RESET} Checking for NVIDIA GPU...\\n"
  
  # Safely detect NVIDIA GPU
  local has_nvidia_gpu=false
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -i nvidia &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} NVIDIA GPU detected.\\n"
    fi
  fi
  
  # Also check for nvidia-smi
  if ! $has_nvidia_gpu && command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} NVIDIA GPU detected via nvidia-smi.\\n"
    fi
  fi
  
  if ! $has_nvidia_gpu; then
    echo -e "${YELLOW}#${RESET} No NVIDIA GPU detected. Skipping NVIDIA container toolkit installation.\\n"
    return 0
  fi
  
  # Check if nvidia-container-toolkit is already installed
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}#${RESET} NVIDIA container toolkit is already installed.\\n"
    configure_nvidia_container_runtime
    return 0
  fi
  
  echo -e "${YELLOW}#${RESET} Installing NVIDIA container toolkit...\\n"
  prepare_nvidia_container_toolkit_apt_preferences
  
  # Install dependencies per https://docs.ollama.com/docker - wrapped in error handling
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey 2>/dev/null | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit GPG key. Continuing anyway...\\n"
    return 0
  fi
  
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list 2>/dev/null \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null 2>&1; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to add NVIDIA container toolkit repository. Continuing anyway...\\n"
    return 0
  fi
  
  if ! sudo apt-get update 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to update package list. Continuing anyway...\\n"
    return 0
  fi
  
  if ! sudo apt-get install -y nvidia-container-toolkit 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Warning: Failed to install NVIDIA container toolkit. Continuing anyway...\\n"
    return 0
  fi
  
  echo -e "${GREEN}#${RESET} NVIDIA container toolkit installed successfully.\\n"
  
  configure_nvidia_container_runtime
}

run_platform_runtime_preinstall() {
  detect_target_platform
  ensure_runtime_prerequisites_installed
  ensure_raspberry_pi_nvidia_prerequisites

  if [[ "${target_platform}" == 'raspberry-pi' ]]; then
    echo -e "${YELLOW}#${RESET} Raspberry Pi detected. Running platform-specific runtime preparation before Nomad installation...\\n"
  else
    echo -e "${YELLOW}#${RESET} Running generic container runtime preparation before Nomad installation...\\n"
  fi

  ensure_docker_installed
  ensure_docker_compose_available
  setup_nvidia_container_toolkit
}

get_install_confirmation(){
  if [[ "${assume_yes}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Auto-confirm enabled: proceeding with Project N.O.M.A.D installation."
    return 0
  fi

  read -p "This script will install/update Project N.O.M.A.D. and its dependencies on your machine. Are you sure you want to continue? (y/N): " choice
  case "$choice" in
    y|Y )
      echo -e "${GREEN}#${RESET} User chose to continue with the installation."
      ;;
    * )
      echo "User chose not to continue with the installation."
      exit 0
      ;;
  esac
}

accept_terms() {
  if [[ "${assume_yes}" == 'true' ]]; then
    accepted_terms='true'
    echo -e "${YELLOW}#${RESET} Auto-confirm enabled: accepting License Agreement & Terms of Use."
    return 0
  fi

  printf "\n\n"
  echo "License Agreement & Terms of Use"
  echo "__________________________"
  printf "\n\n"
  echo "Project N.O.M.A.D. is licensed under the Apache License 2.0. The full license can be found at https://www.apache.org/licenses/LICENSE-2.0 or in the LICENSE file of this repository."
  printf "\n"
  echo "By accepting this agreement, you acknowledge that you have read and understood the terms and conditions of the Apache License 2.0 and agree to be bound by them while using Project N.O.M.A.D."
  echo -e "\n\n"
  read -p "I have read and accept License Agreement & Terms of Use (y/N)? " choice
  case "$choice" in
    y|Y )
      accepted_terms='true'
      ;;
    * )
      echo "License Agreement & Terms of Use not accepted. Installation cannot continue."
      exit 1
      ;;
  esac
}

create_nomad_directory(){
  # Ensure the main installation directory exists
  if [[ ! -d "$NOMAD_DIR" ]]; then
    echo -e "${YELLOW}#${RESET} Creating directory for Project N.O.M.A.D at $NOMAD_DIR...\\n"
    sudo mkdir -p "$NOMAD_DIR"
    sudo chown "$(whoami):$(whoami)" "$NOMAD_DIR"

    echo -e "${GREEN}#${RESET} Directory created successfully.\\n"
  else
    echo -e "${GREEN}#${RESET} Directory $NOMAD_DIR already exists.\\n"
  fi

  # Also ensure the directory has a /storage/logs/ subdirectory
  sudo mkdir -p "${NOMAD_DIR}/storage/logs"

  # Create a admin.log file in the logs directory
  sudo touch "${NOMAD_DIR}/storage/logs/admin.log"
}

download_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"
  refresh_nomad_data_root

  echo -e "${YELLOW}#${RESET} Downloading docker-compose file for management...\\n"
  local compose_source_path=''
  local compose_url="${MANAGEMENT_COMPOSE_FILE_URL}"
  if source_install_enabled; then
    compose_source_path="${source_repo_dir}/install/management_compose.local-build.yaml"
    compose_url=''
  fi
  copy_or_download_file "${compose_source_path}" "${compose_url}" "${compose_file_path}" "the docker compose file"
  echo -e "${GREEN}#${RESET} Docker compose file downloaded successfully to $compose_file_path.\\n"

  local app_key=$(generateRandomPass)
  local db_root_password=$(generateRandomPass)
  local db_user_password=$(generateRandomPass)

  # Inject dynamic env values into the compose file
  echo -e "${YELLOW}#${RESET} Configuring docker-compose file env variables...\\n"
  sed -i "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_file_path"
  sed -i "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_file_path"
  
  sed -i "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|/opt/project-nomad/storage|${nomad_data_root}/storage|g" "$compose_file_path"
  sed -i "s|/opt/project-nomad/mysql|${nomad_data_root}/mysql|g" "$compose_file_path"
  sed -i "s|/opt/project-nomad/redis|${nomad_data_root}/redis|g" "$compose_file_path"
  sed -i "s|__NOMAD_SOURCE_DIR__|${source_repo_dir}|g" "$compose_file_path"

  if grep -q 'replaceme' "$compose_file_path"; then
    echo -e "${RED}#${RESET} Compose templating left unresolved placeholder values in ${WHITE_R}${compose_file_path}${RESET}."
    exit 1
  fi
  
  echo -e "${GREEN}#${RESET} Docker compose file configured successfully.\\n"
}

download_wait_for_it_script() {
  local wait_for_it_script_path="${NOMAD_DIR}/wait-for-it.sh"

  echo -e "${YELLOW}#${RESET} Downloading wait-for-it script...\\n"
  copy_or_download_file '' "$WAIT_FOR_IT_SCRIPT_URL" "$wait_for_it_script_path" "the wait-for-it script"
  chmod +x "$wait_for_it_script_path"
  echo -e "${GREEN}#${RESET} wait-for-it script downloaded successfully to $wait_for_it_script_path.\\n"
}

download_entrypoint_script() {
  local entrypoint_script_path="${NOMAD_DIR}/entrypoint.sh"

  echo -e "${YELLOW}#${RESET} Downloading entrypoint script...\\n"
  local entrypoint_source_path=''
  local entrypoint_url="${ENTRYPOINT_SCRIPT_URL}"
  if source_install_enabled; then
    entrypoint_source_path="${source_repo_dir}/install/entrypoint.sh"
    entrypoint_url=''
  fi
  copy_or_download_file "${entrypoint_source_path}" "${entrypoint_url}" "${entrypoint_script_path}" "the entrypoint script"
  chmod +x "$entrypoint_script_path"
  echo -e "${GREEN}#${RESET} entrypoint script downloaded successfully to $entrypoint_script_path.\\n"
}

download_sidecar_files() {
  # Create sidecar-updater directory if it doesn't exist
  if [[ ! -d "${NOMAD_DIR}/sidecar-updater" ]]; then
    sudo mkdir -p "${NOMAD_DIR}/sidecar-updater"
    sudo chown "$(whoami):$(whoami)" "${NOMAD_DIR}/sidecar-updater"
  fi

  local sidecar_dockerfile_path="${NOMAD_DIR}/sidecar-updater/Dockerfile"
  local sidecar_script_path="${NOMAD_DIR}/sidecar-updater/update-watcher.sh"
  local sidecar_dockerfile_source_path=''
  local sidecar_script_source_path=''
  local sidecar_dockerfile_url="${SIDECAR_UPDATER_DOCKERFILE_URL}"
  local sidecar_script_url="${SIDECAR_UPDATER_SCRIPT_URL}"

  if source_install_enabled; then
    sidecar_dockerfile_source_path="${source_repo_dir}/install/sidecar-updater/Dockerfile"
    sidecar_script_source_path="${source_repo_dir}/install/sidecar-updater/update-watcher.sh"
    sidecar_dockerfile_url=''
    sidecar_script_url=''
  fi

  echo -e "${YELLOW}#${RESET} Downloading sidecar updater Dockerfile...\\n"
  copy_or_download_file "${sidecar_dockerfile_source_path}" "${sidecar_dockerfile_url}" "${sidecar_dockerfile_path}" "the sidecar updater Dockerfile"
  echo -e "${GREEN}#${RESET} Sidecar updater Dockerfile downloaded successfully to $sidecar_dockerfile_path.\\n"

  echo -e "${YELLOW}#${RESET} Downloading sidecar updater script...\\n"
  copy_or_download_file "${sidecar_script_source_path}" "${sidecar_script_url}" "${sidecar_script_path}" "the sidecar updater script"
  chmod +x "$sidecar_script_path"
  echo -e "${GREEN}#${RESET} Sidecar updater script downloaded successfully to $sidecar_script_path.\\n"
}

download_helper_scripts() {
  local start_script_path="${NOMAD_DIR}/start_nomad.sh"
  local stop_script_path="${NOMAD_DIR}/stop_nomad.sh"
  local update_script_path="${NOMAD_DIR}/update_nomad.sh"
  local start_script_source_path=''
  local stop_script_source_path=''
  local update_script_source_path=''
  local start_script_url="${START_SCRIPT_URL}"
  local stop_script_url="${STOP_SCRIPT_URL}"
  local update_script_url="${UPDATE_SCRIPT_URL}"

  if source_install_enabled; then
    start_script_source_path="${source_repo_dir}/install/start_nomad.sh"
    stop_script_source_path="${source_repo_dir}/install/stop_nomad.sh"
    update_script_source_path="${source_repo_dir}/install/update_nomad.sh"
    start_script_url=''
    stop_script_url=''
    update_script_url=''
  fi

  echo -e "${YELLOW}#${RESET} Downloading helper scripts...\\n"
  copy_or_download_file "${start_script_source_path}" "${start_script_url}" "${start_script_path}" "the start script"
  chmod +x "$start_script_path"

  copy_or_download_file "${stop_script_source_path}" "${stop_script_url}" "${stop_script_path}" "the stop script"
  chmod +x "$stop_script_path"

  copy_or_download_file "${update_script_source_path}" "${update_script_url}" "${update_script_path}" "the update script"
  chmod +x "$update_script_path"

  echo -e "${GREEN}#${RESET} Helper scripts downloaded successfully to $start_script_path, $stop_script_path, and $update_script_path.\\n"
}

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Starting management containers using docker compose...\\n"
  if ! sudo docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d --build; then
    echo -e "${RED}#${RESET} Failed to start management containers. Please check the logs and try again."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Management containers started successfully.\\n"
}

get_local_ip() {
  local_ip_address=$(hostname -I | awk '{print $1}')
  if [[ -z "$local_ip_address" ]]; then
    echo -e "${RED}#${RESET} Unable to determine local IP address. Please check your network configuration."
    exit 1
  fi
}
verify_gpu_setup() {
  # This function only displays GPU setup status and is completely non-blocking
  # It never exits or returns error codes - purely informational
  
  echo -e "\\n${YELLOW}#${RESET} GPU Setup Verification\\n"
  echo -e "${YELLOW}===========================================${RESET}\\n"
  
  # Check if NVIDIA GPU is present
  if command -v nvidia-smi &> /dev/null; then
    local gpu_inventory=''
    if gpu_inventory="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null)"; then
      echo -e "${GREEN}✓${RESET} NVIDIA GPU detected:"
      while IFS= read -r line; do
        [[ -n "${line}" ]] && echo -e "  ${WHITE_R}$line${RESET}"
      done <<< "${gpu_inventory}"
      echo ""
    else
      echo -e "${YELLOW}○${RESET} NVIDIA CLI is present but did not report an attached GPU in this session\\n"
    fi
  else
    echo -e "${YELLOW}○${RESET} No NVIDIA GPU detected (nvidia-smi not available)\\n"
  fi
  
  # Check if NVIDIA Container Toolkit is installed
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}✓${RESET} NVIDIA Container Toolkit installed: $(nvidia-ctk --version 2>/dev/null | head -n1)\\n"
  else
    echo -e "${YELLOW}○${RESET} NVIDIA Container Toolkit not installed\\n"
  fi
  
  # Check if Docker has NVIDIA runtime
  if docker_runtime_is_configured; then
    echo -e "${GREEN}✓${RESET} Docker NVIDIA runtime configured\\n"
  else
    echo -e "${YELLOW}○${RESET} Docker NVIDIA runtime not detected\\n"
  fi
  
  # Check for AMD GPU
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -iE "amd|radeon" &> /dev/null; then
      echo -e "${YELLOW}○${RESET} AMD GPU detected (ROCm support not currently available)\\n"
    fi
  fi
  
  echo -e "${YELLOW}===========================================${RESET}\\n"
  
  # Summary
  if command -v nvidia-smi &> /dev/null && docker_runtime_is_configured; then
    echo -e "${GREEN}#${RESET} GPU acceleration is properly configured! The AI Assistant will use your GPU.\\n"
  else
    echo -e "${YELLOW}#${RESET} GPU acceleration not detected. The AI Assistant will run in CPU-only mode.\\n"
    if command -v nvidia-smi &> /dev/null && ! docker_runtime_is_configured; then
      echo -e "${YELLOW}#${RESET} Tip: Your GPU is detected but Docker runtime is not configured.\\n"
      echo -e "${YELLOW}#${RESET} Try restarting Docker: ${WHITE_R}sudo systemctl restart docker${RESET}\\n"
    fi
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D installation completed successfully!\\n"
  echo -e "${GREEN}#${RESET} Installation files are located at /opt/project-nomad\\n\n"
  echo -e "${GREEN}#${RESET} Project N.O.M.A.D's Command Center should automatically start whenever your device reboots. However, if you need to start it manually, you can always do so by running: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} You can now access the management interface at http://localhost:8080 or http://${local_ip_address}:8080\\n"
  if [[ "${boot_order_update_applied}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} A Raspberry Pi EEPROM boot-order update was staged. Reboot the Pi before relying on the new SD-first boot preference.\\n"
  fi
  echo -e "${GREEN}#${RESET} Full installer log: ${WHITE_R}${INSTALL_LOG_FILE}${RESET}\\n"
  echo -e "${GREEN}#${RESET} Thank you for supporting Project N.O.M.A.D!\\n"
}

parse_script_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --preinstall-only)
        preinstall_only='true'
        shift
        ;;
      --preflight-only)
        preflight_only='true'
        shift
        ;;
      --storage-only)
        storage_only='true'
        shift
        ;;
      --debug)
        script_option_debug='true'
        shift
        ;;
      --assume-yes)
        assume_yes='true'
        shift
        ;;
      --format-external-disk)
        format_external_disk='true'
        shift
        ;;
      --external-device)
        external_device="$2"
        shift 2
        ;;
      --external-mount)
        external_mount="$2"
        shift 2
        ;;
      --external-label)
        external_label="$2"
        shift 2
        ;;
      --source-dir)
        source_repo_dir="$2"
        shift 2
        ;;
      *)
        echo -e "${YELLOW}#${RESET} Ignoring unknown option: ${WHITE_R}$1${RESET}\\n"
        shift
        ;;
    esac
  done

  if source_install_enabled && [[ ! -d "${source_repo_dir}" ]]; then
    echo -e "${RED}#${RESET} Local source directory not found: ${WHITE_R}${source_repo_dir}${RESET}"
    exit 1
  fi
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                           Main Script                                                                                           #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

parse_script_args "$@"
setup_logging
trap 'exit_code=$?; log_error_context "$exit_code" ${LINENO} "${BASH_COMMAND}"; exit "$exit_code"' ERR
print_log_location

# Pre-flight checks
check_is_debian_based
check_is_bash
check_has_sudo
ensure_dependencies_installed
check_is_debug_mode

if [[ "${preinstall_only}" == 'true' ]]; then
  skip_storage_preflight='true'
  run_platform_runtime_preinstall
  run_runtime_preflight_checks
  verify_gpu_setup
  exit 0
fi

if [[ "${preflight_only}" == 'true' ]]; then
  detect_target_platform
  run_runtime_preflight_checks
  verify_gpu_setup
  exit 0
fi

if [[ "${storage_only}" == 'true' ]]; then
  detect_target_platform
  configure_external_storage
  run_runtime_preflight_checks
  exit 0
fi

# Main install
get_install_confirmation
accept_terms
run_platform_runtime_preinstall
configure_external_storage
run_runtime_preflight_checks
get_local_ip
create_nomad_directory
prepare_local_build_source_checkout
write_install_metadata
download_wait_for_it_script
download_entrypoint_script
download_sidecar_files
download_helper_scripts
download_management_compose_file
start_management_containers
verify_gpu_setup
success_message

# free_space_check() {
#   if [[ "$(df -B1 / | awk 'NR==2{print $4}')" -le '5368709120' ]]; then
#     header_red
#     echo -e "${YELLOW}#${RESET} You only have $(df -B1 / | awk 'NR==2{print $4}' | awk '{ split( "B KB MB GB TB PB EB ZB YB" , v ); s=1; while( $1>1024 && s<9 ){ $1/=1024; s++ } printf "%.1f %s", $1, v[s] }') of disk space available on \"/\"... \\n"
#     while true; do
#       read -rp $'\033[39m#\033[0m Do you want to proceed with running the script? (y/N) ' yes_no
#       case "$yes_no" in
#          [Nn]*|"")
#             free_space_check_response="Cancel script"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} OK... Please free up disk space before running the script again..."
#             cancel_script
#             break;;
#          [Yy]*)
#             free_space_check_response="Proceed at own risk"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} OK... Proceeding with the script.. please note that failures may occur due to not enough disk space... \\n"; sleep 10
#             break;;
#          *) echo -e "\\n${RED}#${RESET} Invalid input, please answer Yes or No (y/n)...\\n"; sleep 3;;
#       esac
#     done
#     if [[ -n "$(command -v jq)" ]]; then
#       if [[ "$(dpkg-query --showformat='${version}' --show jq 2> /dev/null | sed -e 's/.*://' -e 's/-.*//g' -e 's/[^0-9.]//g' -e 's/\.//g' | sort -V | tail -n1)" -ge "16" && -e "${eus_dir}/db/db.json" ]]; then
#         jq '.scripts."'"${script_name}"'" += {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}}' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       else
#         jq '.scripts."'"${script_name}"'" = (.scripts."'"${script_name}"'" | . + {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}})' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       fi
#       eus_database_move
#     fi
#   fi
# }
