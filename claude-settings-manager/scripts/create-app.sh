#!/bin/bash
# Create macOS .app bundle for Claude Settings Manager

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="Claude Settings"
APP_BUNDLE="$PROJECT_DIR/$APP_NAME.app"
ICON_SET_DIR="/tmp/claude/AppIcon.iconset"

echo "Creating $APP_NAME.app bundle..."

# Clean up any existing bundle
rm -rf "$APP_BUNDLE"

# Create app bundle structure
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Create launch script
cat > "$APP_BUNDLE/Contents/MacOS/launch" << 'LAUNCH_SCRIPT'
#!/bin/bash
APP_DIR="$HOME/dev/personal-tools/claude-settings-manager"

cd "$APP_DIR"

# Check if server is already running on port 3000
if ! lsof -i :3000 > /dev/null 2>&1; then
    echo "Starting production server..."
    pnpm start &
    SERVER_PID=$!

    # Wait for server to be ready
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
fi

# Open browser
open http://localhost:3000
LAUNCH_SCRIPT

chmod +x "$APP_BUNDLE/Contents/MacOS/launch"

# Create Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" << 'INFO_PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>Claude Settings</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.claude.settings-manager</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Claude Settings</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright 2025</string>
</dict>
</plist>
INFO_PLIST

# Convert SVG to ICNS
echo "Converting icon to ICNS format..."

# Create iconset directory
rm -rf "$ICON_SET_DIR"
mkdir -p "$ICON_SET_DIR"

SVG_PATH="$PROJECT_DIR/public/app-icon.svg"

# Check if rsvg-convert is available, otherwise use sips with a PNG fallback
if command -v rsvg-convert &> /dev/null; then
    # Generate all required icon sizes using rsvg-convert
    for size in 16 32 64 128 256 512; do
        rsvg-convert -w $size -h $size "$SVG_PATH" -o "$ICON_SET_DIR/icon_${size}x${size}.png"
    done
    # Generate @2x versions
    for size in 16 32 128 256 512; do
        double=$((size * 2))
        rsvg-convert -w $double -h $double "$SVG_PATH" -o "$ICON_SET_DIR/icon_${size}x${size}@2x.png"
    done
else
    echo "rsvg-convert not found, using qlmanage for conversion..."
    # Create a high-res PNG from SVG using Quick Look
    qlmanage -t -s 1024 -o /tmp/claude "$SVG_PATH" 2>/dev/null || {
        echo "Warning: Could not convert SVG. Using placeholder approach."
        # Create a simple colored PNG as fallback using sips
        # First create base image at 1024x1024
        sips -z 1024 1024 --padColor FF8C6B "$SVG_PATH" --out "/tmp/claude/icon_base.png" 2>/dev/null || {
            # Ultimate fallback - just copy SVG and hope for the best
            echo "Creating basic icon..."
        }
    }

    # If qlmanage created the file, rename it
    if [ -f "/tmp/claude/app-icon.svg.png" ]; then
        mv "/tmp/claude/app-icon.svg.png" "/tmp/claude/icon_base.png"
    fi

    # Generate required sizes from base PNG if it exists
    if [ -f "/tmp/claude/icon_base.png" ]; then
        for size in 16 32 64 128 256 512 1024; do
            sips -z $size $size "/tmp/claude/icon_base.png" --out "$ICON_SET_DIR/icon_${size}x${size}.png" 2>/dev/null
        done
        # Create @2x versions
        for size in 16 32 128 256 512; do
            double=$((size * 2))
            cp "$ICON_SET_DIR/icon_${double}x${double}.png" "$ICON_SET_DIR/icon_${size}x${size}@2x.png" 2>/dev/null || true
        done
    fi
fi

# Create the icns file if we have the iconset
if [ -d "$ICON_SET_DIR" ] && [ "$(ls -A $ICON_SET_DIR)" ]; then
    iconutil -c icns "$ICON_SET_DIR" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null || {
        echo "Warning: Could not create ICNS file. App will use default icon."
    }
fi

# Clean up
rm -rf "$ICON_SET_DIR"

echo ""
echo "App bundle created: $APP_BUNDLE"
echo ""
echo "To install:"
echo "  cp -r \"$APP_BUNDLE\" ~/Applications/"
echo ""
echo "Or drag '$APP_NAME.app' to your Applications folder"
