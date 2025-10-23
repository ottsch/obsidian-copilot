#!/usr/bin/env bash

# Wrapper script to run the note embeddings CLI with Bun
# Bun has native TypeScript support, so we can run the .ts file directly

if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed"
    echo "Install it from: https://bun.sh"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the TypeScript file directly with Bun
exec bun run "${SCRIPT_DIR}/embed-notes.ts" "$@"
