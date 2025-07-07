#!/bin/bash

# Test script for x402 payment gateway

echo "Testing x402 Payment Gateway"
echo "============================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Gateway URL
GATEWAY_URL="http://localhost:8081"

# Test 1: Payment Required (no payment header)
echo -e "\n${YELLOW}Test 1: Request without payment header${NC}"
echo "Expected: 402 Payment Required"
response=$(curl -s -w "\nHTTP_STATUS_CODE:%{http_code}" "$GATEWAY_URL/api/v1/stations")
status_code=$(echo "$response" | grep "HTTP_STATUS_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS_CODE/d')

if [ "$status_code" = "402" ]; then
    echo -e "${GREEN}✓ Test passed${NC} - Status: $status_code"
    # Check if response has the correct x402-axios format
    has_version=$(echo "$body" | jq -r '.x402Version' 2>/dev/null)
    has_accepts=$(echo "$body" | jq -r '.accepts' 2>/dev/null)
    if [ "$has_version" = "1" ] && [ "$has_accepts" != "null" ]; then
        echo -e "${GREEN}✓ Response has correct x402-axios format${NC}"
    fi
    echo "Response: $body"
else
    echo -e "${RED}✗ Test failed${NC} - Status: $status_code (expected 402)"
    echo "Response: $body"
fi

# Test 2: Invalid Payment Token (malformed JSON)
echo -e "
${YELLOW}Test 2: Request with invalid payment token${NC}"
echo "Expected: 401 Unauthorized"
INVALID_PAYLOAD=$(echo -n '{"invalid": "json"}' | base64)
response=$(curl -s -w "
HTTP_STATUS_CODE:%{http_code}" -H "X-PAYMENT: $INVALID_PAYLOAD" "$GATEWAY_URL/api/v1/stations")
status_code=$(echo "$response" | grep "HTTP_STATUS_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS_CODE/d')

if [ "$status_code" = "401" ]; then
    echo -e "${GREEN}✓ Test passed${NC} - Status: $status_code"
    echo "Response: $body"
else
    echo -e "${RED}✗ Test failed${NC} - Status: $status_code (expected 401)"
    echo "Response: $body"
fi

# Test 3: Valid Payment Token Format (but will be rejected by facilitator)
echo -e "
${YELLOW}Test 3: Request with valid format payment token${NC}"
echo "Expected: 400 Bad Request (invalid payment) or 502 (facilitator error)"

# Create a properly formatted payment payload
PAYMENT_PAYLOAD='{
  "x402Version": 1,
  "scheme": "exact",
  "network": "filecoin-calibration",
  "payload": {
    "signature": "0xmocksignature",
    "authorization": {
      "from": "0x1234567890123456789012345678901234567890",
      "to": "0x01e5B9613edC86E28b9868Cb97b162Ffd1351a74",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "9999999999",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    }
  }
}'

PAYMENT_B64=$(echo -n "$PAYMENT_PAYLOAD" | base64)
response=$(curl -s -w "\nHTTP_STATUS_CODE:%{http_code}" -H "X-PAYMENT: $PAYMENT_B64" "$GATEWAY_URL/api/v1/stations")
status_code=$(echo "$response" | grep "HTTP_STATUS_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS_CODE/d')

if [ "$status_code" = "400" ] || [ "$status_code" = "502" ] || [ "$status_code" = "500" ]; then
    echo -e "${GREEN}✓ Test passed${NC} - Status: $status_code"
    if [ "$status_code" = "502" ] || [ "$status_code" = "500" ]; then
        echo "Note: 502/500 likely means facilitator is not running or returned an error"
    fi
    echo "Response: $body"
else
    echo -e "${RED}✗ Test failed${NC} - Status: $status_code (expected 400, 502, or 500)"
    echo "Response: $body"
fi

# Test 4: Check if facilitator is accessible
echo -e "\n${YELLOW}Test 4: Check facilitator availability${NC}"
echo "Testing facilitator at http://localhost:8080/api/v1/verify"
response=$(curl -s -w "\nHTTP_STATUS_CODE:%{http_code}" -X POST "http://localhost:8080/api/v1/verify" -H "Content-Type: application/json" -d '{}')
status_code=$(echo "$response" | grep "HTTP_STATUS_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS_CODE/d')

if [ "$status_code" = "200" ] || [ "$status_code" = "400" ] || [ "$status_code" = "422" ]; then
    echo -e "${GREEN}✓ Facilitator is accessible${NC} - Status: $status_code"
    echo "Response: $body"
else
    echo -e "${RED}✗ Facilitator may not be running${NC} - Status: $status_code"
    echo "Make sure your facilitator is running at localhost:8080"
fi

echo -e "\n${YELLOW}Testing complete!${NC}"