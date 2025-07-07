#!/bin/bash

# Test script to debug binary response issue

echo "Testing direct WeatherXM API response..."
echo "======================================"

# Make a test payment
PAYMENT_PAYLOAD='{
  "x402Version": 1,
  "scheme": "exact",
  "network": "filecoin-calibration",
  "payload": {
    "signature": "0xDEBUG_BYPASS",
    "authorization": {
      "from": "0x1234567890123456789012345678901234567890",
      "to": "0x01e5B9613edC86E28b9868Cb97b162Ffd1351a74",
      "value": "100000000000000000",
      "validAfter": "0",
      "validBefore": "9999999999",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    }
  }
}'

PAYMENT_B64=$(echo -n "$PAYMENT_PAYLOAD" | base64)

echo "Making request through gateway..."
echo "Response headers:"
curl -i -H "X-PAYMENT: $PAYMENT_B64" \
     -H "Accept: application/json" \
     -H "Accept-Encoding: identity" \
     "http://localhost:8081/api/v1/stations" 2>&1 | head -50

echo -e "\n\nChecking Content-Encoding header..."
curl -s -I -H "X-PAYMENT: $PAYMENT_B64" \
     -H "Accept: application/json" \
     "http://localhost:8081/api/v1/stations" | grep -i "content-"

echo -e "\n\nSaving response to file for analysis..."
curl -s -H "X-PAYMENT: $PAYMENT_B64" \
     -H "Accept: application/json" \
     -o response.bin \
     "http://localhost:8081/api/v1/stations"

echo "Response saved to response.bin"
echo "File type:"
file response.bin

echo -e "\nFirst 100 bytes (hex):"
xxd -l 100 response.bin

echo -e "\nTrying to decompress as gzip..."
if gunzip -c response.bin > response.json 2>/dev/null; then
    echo "Successfully decompressed! First 500 chars of JSON:"
    head -c 500 response.json
    echo
else
    echo "Not gzip compressed or decompression failed"
fi