#!/bin/bash
# Build and deploy the Electron app to local Applications folder
set -e

cd "$(dirname "$0")/.."

# Clean previous build artifacts to avoid code signing issues
echo "Cleaning build artifacts..."
rm -rf dist .standalone-build .next

# Build the app
echo "Building Electron app..."
pnpm electron:build

# Deploy to Applications
echo "Deploying to ~/Applications..."
cp -R dist/mac-arm64/Claude\ Settings.app ~/Applications/
echo "Deployed Claude Settings.app to ~/Applications"
