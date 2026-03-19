#!/usr/bin/env bash
set -euo pipefail

mkdir -p /config

if [[ ! -f /config/welle-cli.ini ]]; then
  touch /config/welle-cli.ini
fi

exec welle-cli "$@"
