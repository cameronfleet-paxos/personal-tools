#!/bin/bash
# Deploy Otto Schedule to Applications folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Otto Schedule"
SOURCE="$SCRIPT_DIR/dist/mac-arm64/$APP_NAME.app"
DEST="/Users/cameronfleet/Applications/$APP_NAME.app"

if [ ! -d "$SOURCE" ]; then
    echo "Error: Built app not found at $SOURCE"
    echo "Run 'pnpm electron:build' first"
    exit 1
fi

echo "Deploying $APP_NAME..."

# Remove existing app if present
if [ -d "$DEST" ]; then
    rm -rf "$DEST"
fi

# Copy new app
cp -R "$SOURCE" "$DEST"

echo "Deployed to $DEST"
