#!/bin/bash

# Build script for x402 KrakenD plugin

echo "Building x402-payment-gate plugin..."

# Change to the plugins directory
cd "$(dirname "$0")/plugins"

# Build the plugin using the official KrakenD builder
# Build for AMD64 to match the KrakenD container architecture
echo "Building plugin for linux/amd64..."
docker run --rm -v "$PWD:/go/src/plugin" -w /go/src/plugin \
  --platform linux/amd64 \
  krakend/builder:2.10.1 \
  go build -buildmode=plugin -o x402-payment-gate.so .

if [ $? -eq 0 ]; then
    echo "Plugin built successfully: x402-payment-gate.so"
    ls -la x402-payment-gate.so
    file x402-payment-gate.so
else
    echo "Plugin build failed!"
    exit 1
fi