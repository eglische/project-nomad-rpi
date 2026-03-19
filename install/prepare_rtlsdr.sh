#!/bin/bash
set -euo pipefail

BLACKLIST_FILE="/etc/modprobe.d/nomad-rtl-sdr.conf"
RTL_MODULES=(
  rtl2832_sdr
  dvb_usb_rtl28xxu
  rtl2832
  rtl2830
  dvb_usb_v2
)

echo "Preparing RTL-SDR access for Project N.O.M.A.D..."

if ! command -v lsusb >/dev/null 2>&1; then
  echo "lsusb is not available. Install usbutils if you want hardware detection details."
fi

if command -v lsusb >/dev/null 2>&1 && ! lsusb | grep -qiE '0bda:2838|rtl2838|rtl2832'; then
  echo "No RTL-SDR dongle detected right now. Applying host-side prep anyway."
fi

cat > "${BLACKLIST_FILE}" <<'EOF'
# Project N.O.M.A.D RTL-SDR host prep
# Prevent the DVB stack from auto-claiming RTL2832-based SDR dongles
blacklist rtl2832_sdr
blacklist dvb_usb_rtl28xxu
blacklist rtl2832
blacklist rtl2830
blacklist dvb_usb_v2
EOF

echo "Wrote ${BLACKLIST_FILE}"

for module in "${RTL_MODULES[@]}"; do
  if lsmod | awk '{print $1}' | grep -qx "${module}"; then
    modprobe -r "${module}" 2>/dev/null || true
  fi
done

if command -v udevadm >/dev/null 2>&1; then
  udevadm control --reload >/dev/null 2>&1 || true
  udevadm trigger >/dev/null 2>&1 || true
fi

echo "RTL-SDR prep complete."
