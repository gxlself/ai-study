#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export pnpm_config_verify_deps_before_run=false
exec "${NODE_BINARY:-node}" "$SCRIPT_DIR/install.mjs" "$@"
