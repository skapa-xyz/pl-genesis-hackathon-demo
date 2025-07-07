# x402 Payment Gateway for WeatherXM Pro API

This is an implementation of an x402 payment proxy using KrakenD API Gateway and a custom Go plugin. It wraps the WeatherXM Pro API with a payment mechanism based on the x402 protocol, allowing clients to pay for API requests on a per-call basis.

## Architecture

The system consists of:
- **KrakenD API Gateway**: The main gateway that routes requests
- **x402 Go Plugin**: Custom plugin that handles payment validation
- **x402 Facilitator**: Service that validates and settles payment tokens
- **WeatherXM Pro API**: The upstream weather data service

The gateway returns 402 responses in the x402-axios compatible format, allowing seamless integration with x402-enabled clients.

## Configuration

The gateway requires the following environment variables:
- `WEATHERXM_API_KEY`: Your WeatherXM Pro API key
- `PAYMENT_ADDRESS`: Your wallet address for receiving payments (0x...)
- `MAX_AMOUNT_REQUIRED`: The price in atomic units (e.g., "1000000" for $1 USDC with 6 decimals)
- `NETWORK`: The blockchain network (e.g., "base-sepolia", "base", "filecoin-calibration")
- `ASSET_ADDRESS`: The token contract address (e.g., USDC contract address)
- `MAX_TIMEOUT_SECONDS`: Payment validity window in seconds (default: 300)
- `X402_FACILITATOR_URL`: The facilitator service URL

## Quick Start

1. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and add your WEATHERXM_API_KEY
   ```

2. **Build the plugin**:
   ```bash
   ./build-plugin.sh
   ```

3. **Generate the KrakenD configuration**:
   ```bash
   source .env && ./generate-config.sh
   ```

4. **Start the services**:
   ```bash
   docker-compose up
   ```

5. **Test the gateway**:
   ```bash
   ./test-gateway.sh
   ```

## Request Flow

### Unpaid Request
1. Client sends request without X-PAYMENT header
2. Gateway returns 402 Payment Required

### Paid Request
1. Client sends request with X-PAYMENT header
2. Plugin verifies token with facilitator's `/verify` endpoint
3. If valid, plugin adds X-API-KEY header and forwards to WeatherXM
4. Response is returned to client
5. If response is successful (2xx), plugin settles payment via facilitator's `/settle` endpoint

## Testing

The x402 payment system uses Base64-encoded payment payloads following the official x402 protocol.

Example requests:

```bash
# Request without payment (returns 402 with payment requirements)
curl http://localhost:8081/api/v1/stations

# The 402 response will include payment requirements in x402-axios format:
# {
#   "x402Version": 1,
#   "accepts": [
#     {
#       "scheme": "exact",
#       "network": "filecoin-calibration",
#       "maxAmountRequired": "1000000",
#       "resource": "http://localhost:8081/api/v1/stations",
#       "payTo": "0xYourWalletAddress",
#       "asset": "0xCD928583440157eDfB744201cb69dEeBDEe62bb8",
#       "maxTimeoutSeconds": 300,
#       "description": "WeatherXM Pro API Access",
#       "mimeType": "application/json"
#     }
#   ]
# }

# Request with mock payment (for testing with mock facilitator)
# Create a test payment payload
PAYMENT_PAYLOAD='{
  "x402Version": 1,
  "scheme": "exact",
  "network": "filecoin-calibration",
  "payload": {
    "signature": "0xmocksignature",
    "authorization": {
      "from": "0x1234567890123456789012345678901234567890",
      "to": "0xYourWalletAddress",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "9999999999",
      "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
    }
  }
}'

# Encode to Base64 and make request
PAYMENT_B64=$(echo -n "$PAYMENT_PAYLOAD" | base64)
curl -H "X-PAYMENT: $PAYMENT_B64" http://localhost:8081/api/v1/stations
```

Note: In production, the X-PAYMENT header would contain a properly signed ERC-3009 authorization.

## Production Deployment

For production use:
1. Set `X402_FACILITATOR_URL` to `https://x402.org/facilitator` (or your CDP facilitator for mainnet)
2. Set `PAYMENT_ADDRESS` to your actual wallet address
3. Configure `NETWORK` to your desired blockchain (e.g., "base" for mainnet)
4. Set `ASSET_ADDRESS` to the appropriate token contract for your network
5. Set `MAX_AMOUNT_REQUIRED` in atomic units for your pricing
6. Ensure `WEATHERXM_API_KEY` is securely configured
7. Consider implementing caching for payment validation
8. Add proper logging and monitoring

### Supported Networks and Assets

The default configuration uses:
- **Filecoin Calibration** (testnet): USDFC at `0xCD928583440157eDfB744201cb69dEeBDEe62bb8`

Other supported networks:
- **Base Sepolia** (testnet): USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Base** (mainnet): USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

For other networks and assets, consult the x402 documentation.