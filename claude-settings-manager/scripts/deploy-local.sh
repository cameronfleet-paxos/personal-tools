#!/bin/bash
# Deploy the built Electron app to local Applications folder
cp -R dist/mac-arm64/Claude\ Settings.app /Users/cameronfleet/Applications/
echo "Deployed Claude Settings.app to ~/Applications"
