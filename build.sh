#!/bin/bash
# Exit script on first error
set -e

echo "==================================================="
echo "  Building PDF Combiner Pro for Unix Platforms"
echo "==================================================="
echo

echo "Installing npm dependencies..."
if ! npm install; then
    echo
    echo "Warning: First npm install failed. Attempting clean install..."
    echo "Deleting node_modules and package-lock.json..."
    rm -rf node_modules package-lock.json
    echo
    echo "Clearing npm cache..."
    npm cache clean --force || true
    echo
    echo "Retrying npm install..."
    npm install
fi

# Determine OS type
OS_TYPE="$(uname -s)"

if [ "$OS_TYPE" = "Darwin" ]; then
    echo
    echo "Detected macOS. Compiling DMG installer..."
    npm run build:mac
elif [ "$OS_TYPE" = "Linux" ]; then
    echo
    echo "Detected Linux. Compiling Linux package..."
    npm run build:linux
else
    echo
    echo "Unknown OS type: $OS_TYPE. Attempting generic build..."
    npm run build:win
fi

echo
echo "==================================================="
echo "  Build completed! Output is in the 'dist' folder."
echo "==================================================="
