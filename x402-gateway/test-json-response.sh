#!/bin/bash

# Test script to verify JSON responses

echo "Testing JSON response from gateway..."
echo "===================================="

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
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000002"
    }
  }
}'

PAYMENT_B64=$(echo -n "$PAYMENT_PAYLOAD" | base64)

echo "Making request to /api/v1/stations..."
response=$(curl -s -H "X-PAYMENT: $PAYMENT_B64" \
     -H "Accept: application/json" \
     "http://localhost:8081/api/v1/stations")

echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"

echo -e "\n\nChecking if response is valid JSON..."
if echo "$response" | jq . >/dev/null 2>&1; then
    echo "✅ Valid JSON response!"
    echo "Number of stations: $(echo "$response" | jq 'length')"
else
    echo "❌ Not valid JSON"
    echo "First 200 characters:"
    echo "$response" | head -c 200
    echo -e "\n\nHex dump of first 100 bytes:"
    echo "$response" | xxd -l 100
fi