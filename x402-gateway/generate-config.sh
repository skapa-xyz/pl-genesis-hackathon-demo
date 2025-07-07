#!/bin/bash

# Generate KrakenD configuration with environment variables

# Source .env file if it exists
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    source .env
else
    echo "Warning: .env file not found. Using defaults or existing environment variables."
fi

cat > krakend.json <<EOF
{
  "version": 3,
  "name": "X402 Payment Gateway",
  "port": 8080,
  "plugin": {
    "folder": "/etc/krakend/plugins/",
    "pattern": ".so"
  },
  "timeout": "30s",
  "cache_ttl": "0s",
  "extra_config": {
    "telemetry/logging": {
      "level": "DEBUG",
      "prefix": "[KRAKEND]",
      "syslog": false,
      "stdout": true
    },
    "plugin/http-server": {
      "name": "x402-payment-gate",
      "x402-payment-gate": {
        "facilitator_url": "${X402_FACILITATOR_URL:-http://host.docker.internal:8080}",
        "backend_api_key": "${WEATHERXM_API_KEY}",
        "payment_header_name": "X-PAYMENT",
        "auth_header_name": "X-API-KEY",
        "payment_address": "${PAYMENT_ADDRESS}",
        "max_amount_required": "${MAX_AMOUNT_REQUIRED:-1000000}",
        "network": "${NETWORK:-filecoin-calibration}",
        "description": "USD for Filecoin Community",
        "asset": "${ASSET_ADDRESS:-0xCD928583440157eDfB744201cb69dEeBDEe62bb8}",
        "max_timeout_seconds": 300,
        "mime_type": "application/json"
      }
    }
  },
  "endpoints": [
    {
      "endpoint": "/api/v1/{level1}",
      "method": "GET",
      "output_encoding": "no-op",
      "input_headers": ["*"],
      "input_query_strings": ["*"],
      "backend": [
        {
          "url_pattern": "/api/v1/{level1}",
          "encoding": "no-op",
          "host": ["https://pro.weatherxm.com"]
        }
      ]
    },
    {
      "endpoint": "/api/v1/{level1}/{level2}",
      "method": "GET",
      "output_encoding": "no-op",
      "input_headers": ["*"],
      "input_query_strings": ["*"],
      "backend": [
        {
          "url_pattern": "/api/v1/{level1}/{level2}",
          "encoding": "no-op",
          "host": ["https://pro.weatherxm.com"]
        }
      ]
    },
    {
      "endpoint": "/api/v1/{level1}/{level2}/{level3}",
      "method": "GET",
      "output_encoding": "no-op",
      "input_headers": ["*"],
      "input_query_strings": ["*"],
      "backend": [
        {
          "url_pattern": "/api/v1/{level1}/{level2}/{level3}",
          "encoding": "no-op",
          "host": ["https://pro.weatherxm.com"]
        }
      ]
    },
    {
      "endpoint": "/api/v1/{level1}",
      "method": "POST",
      "output_encoding": "no-op",
      "input_headers": ["*"],
      "input_query_strings": ["*"],
      "backend": [
        {
          "url_pattern": "/api/v1/{level1}",
          "encoding": "no-op",
          "host": ["https://pro.weatherxm.com"]
        }
      ]
    },
    {
      "endpoint": "/api/v1/{level1}/{level2}",
      "method": "POST",
      "output_encoding": "no-op",
      "input_headers": ["*"],
      "input_query_strings": ["*"],
      "backend": [
        {
          "url_pattern": "/api/v1/{level1}/{level2}",
          "encoding": "no-op",
          "host": ["https://pro.weatherxm.com"]
        }
      ]
    }
  ]
}
EOF

echo "Generated krakend.json with environment variables"