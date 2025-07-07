# WeatherXM x402 Per-Request Pricing Model

This document demonstrates how WeatherXM's subscription-based pricing can be translated into a unified per-request pricing model using the x402 payment protocol.

## Pricing Philosophy

Our per-request pricing eliminates subscription tiers in favor of a simple, usage-based model where:
- Every user pays the same rate for the same endpoint
- Prices reflect the computational cost and data value
- No upfront commitments or tier restrictions
- Enterprise users benefit from reasonable base pricing without requiring discounts

## Unified Endpoint Pricing

### Station Observation Endpoints

| Endpoint | Price per Request | Description |
|----------|-------------------|-------------|
| `/api/v1/stations` | $0.0001 | List all stations (basic metadata) |
| `/api/v1/stations/{id}/latest` | $0.0003 | Latest observation from a station |
| `/api/v1/stations/{id}/health` | $0.0003 | Station health metrics |
| `/api/v1/stations/{id}/history` | Variable | Historical data (see below) |

#### Historical Data Pricing
| Query Period | Price per Request | Example |
|--------------|-------------------|---------|
| 1 day | $0.0005 | Last 24 hours of data |
| 7 days | $0.002 | Last week of data |
| 30 days | $0.005 | Last month of data |
| 90 days | $0.01 | Last 3 months of data |

### Forecast Endpoints

| Endpoint | Price per Request | Description |
|----------|-------------------|-------------|
| `/api/v1/forecast/wxmv1/{location}` | $0.001 | Basic forecast model |
| `/api/v1/forecast/wxmv2/{location}` | $0.002 | Enhanced forecast model |
| `/api/v1/forecast/wxmv3/{location}` | $0.005 | Premium forecast model |
| `/api/v1/forecast/multi-model/{location}` | $0.008 | Multi-model ensemble forecast |

### Special Services

| Service | Price | Description |
|---------|-------|-------------|
| Custom WXMv3 Station | $0.02 per request | Access to custom station forecasts |
| Bulk Data Export | $0.00001 per record | For large historical data exports |
| Real-time Webhooks | $0.001 per event | Push notifications for observations |

## Example Calculations

### Example 1: Small Application (Personal Tier Equivalent)
- 500 API calls/month (≈17/day)
- Mix of latest observations and basic forecasts

**Daily breakdown:**
- 10 latest observations: 10 × $0.0003 = $0.003
- 5 WXMv1 forecasts: 5 × $0.001 = $0.005
- 2 station listings: 2 × $0.0001 = $0.0002
- **Total: $0.0082/day (~$0.25/month)**

*Compare to Personal subscription: $0/month for 500 calls*

### Example 2: Basic Usage Pattern
- 10,000 API calls/month (≈333/day)
- Includes historical data queries

**Daily breakdown:**
- 200 latest observations: 200 × $0.0003 = $0.06
- 100 WXMv1 forecasts: 100 × $0.001 = $0.10
- 20 7-day historical: 20 × $0.002 = $0.04
- 13 station listings: 13 × $0.0001 = $0.0013
- **Total: $0.2013/day (~$6.04/month)**

*Compare to Basic subscription: $50/month for 10,000 calls*

### Example 3: Professional Weather Service
- 20,000 API calls/month (≈667/day)
- Advanced forecasts and historical data

**Daily breakdown:**
- 300 latest observations: 300 × $0.0003 = $0.09
- 200 WXMv2 forecasts: 200 × $0.002 = $0.40
- 100 30-day historical: 100 × $0.005 = $0.50
- 50 WXMv3 forecasts: 50 × $0.005 = $0.25
- 17 multi-model forecasts: 17 × $0.008 = $0.136
- **Total: $1.376/day (~$41.28/month)**

*Compare to Professional subscription: $200/month for 20,000 calls*

### Example 4: Enterprise Integration
- 50,000 API calls/month (≈1,667/day)
- Full feature usage with custom stations

**Daily breakdown:**
- 1,000 latest observations: 1,000 × $0.0003 = $0.30
- 300 WXMv3 forecasts: 300 × $0.005 = $1.50
- 200 90-day historical: 200 × $0.01 = $2.00
- 100 multi-model forecasts: 100 × $0.008 = $0.80
- 50 custom station forecasts: 50 × $0.02 = $1.00
- 17 station listings: 17 × $0.0001 = $0.0017
- **Total: $5.6017/day (~$168.05/month)**

*Compare to Enterprise subscription: $500/month for 50,000 calls*

### Example 5: High-Volume Enterprise
- 200,000 API calls/month (≈6,667/day)

**Daily breakdown:**
- 4,000 latest observations: 4,000 × $0.0003 = $1.20
- 1,500 WXMv2 forecasts: 1,500 × $0.002 = $3.00
- 500 90-day historical: 500 × $0.01 = $5.00
- 500 WXMv3 forecasts: 500 × $0.005 = $2.50
- 167 multi-model forecasts: 167 × $0.008 = $1.336
- **Total: $13.036/day (~$391.08/month)**

*No equivalent subscription tier - would require custom Enterprise pricing*

## Payment Configuration

### USDFC Token Configuration (Filecoin Calibration)
```javascript
{
  "network": "filecoin-calibration",
  "asset": "0xCD928583440157eDfB744201cb69dEeBDEe62bb8",
  "decimals": 18,
  "symbol": "USDFC"
}
```

### Example Payment Amounts (in wei)
- $0.001 = 1000000000000000 (1e15)
- $0.005 = 5000000000000000 (5e15)
- $0.01 = 10000000000000000 (1e16)
- $0.10 = 100000000000000000 (1e17)

## Comparison with Subscription Model

| Usage Level | Subscription Cost | x402 Per-Request Cost | Savings |
|-------------|-------------------|----------------------|---------|
| 500 calls/month | $0 (Personal) | ~$0.25 | - |
| 10,000 calls/month | $50 (Basic) | ~$6.04 | 88% |
| 20,000 calls/month | $200 (Professional) | ~$41.28 | 79% |
| 50,000 calls/month | $500 (Enterprise) | ~$168.05 | 66% |
| 200,000 calls/month | Custom pricing | ~$391.08 | Predictable |

## Advantages of Per-Request Pricing

1. **No Tiers or Commitments**: Everyone gets the same fair pricing
2. **Significant Savings**: Up to 88% cheaper for typical usage patterns
3. **No Overage Fees**: Pay exactly for what you use
4. **Feature Access**: All features available to all users
5. **Scalability**: Linear, predictable costs as you grow
6. **Flexibility**: Use different endpoints based on immediate needs

## Why This Pricing Works

- **Basic users** save significantly compared to subscriptions
- **Enterprise users** get predictable, reasonable pricing without needing discounts
- **Prices reflect actual costs** of data processing and storage
- **No artificial tier restrictions** limiting access to features

## Implementation Notes

1. All prices are in USD equivalent
2. Payments are processed in cryptocurrency (USDFC)
3. Volume discounts are calculated daily and reset at UTC midnight
4. Custom station additions require separate arrangement
5. Prices may be adjusted based on network conditions and demand

---

*This pricing model is for demonstration purposes and shows how subscription-based APIs can be converted to per-request pricing using the x402 payment protocol.*