const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

// Get valid token from environment variable
const VALID_TEST_TOKEN = process.env.VALID_TEST_TOKEN || 'test-valid-token';

// Track used tokens to prevent double-spending in settle
const usedTokens = new Set();

// Mock verify endpoint - checks if payment is valid
app.post('/api/v1/verify', (req, res) => {
  console.log('[Mock Facilitator] Received verify request');
  
  const { x402Version, paymentPayload, paymentRequirements } = req.body;
  
  // Check if this is from a header
  const xPaymentHeader = req.headers['x-payment'];
  const xPaymentRequirementsHeader = req.headers['x-payment-requirements'];
  
  if (xPaymentHeader) {
    console.log('[Mock Facilitator] Processing X-Payment header');
    try {
      const paymentPayloadFromHeader = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString());
      req.body.paymentPayload = paymentPayloadFromHeader;
    } catch (err) {
      console.log('[Mock Facilitator] Failed to decode X-Payment header:', err);
      return res.status(400).json({ 
        x402Version: 1,
        error: 'Invalid X-Payment header encoding' 
      });
    }
  }
  
  if (!req.body.paymentPayload) {
    console.log('[Mock Facilitator] Missing payment payload');
    return res.status(400).json({ 
      x402Version: 1,
      error: 'Missing payment payload' 
    });
  }
  
  console.log('[Mock Facilitator] Payment payload:', JSON.stringify(req.body.paymentPayload, null, 2));
  
  if (req.body.paymentRequirements) {
    console.log('[Mock Facilitator] Payment requirements:', JSON.stringify(req.body.paymentRequirements, null, 2));
  }
  
  // Simple validation: for testing, we'll accept any payment with valid structure
  const payload = req.body.paymentPayload;
  if (payload && payload.x402Version === 1 && payload.scheme === 'exact' && payload.payload) {
    console.log('[Mock Facilitator] Payment verified successfully');
    
    // Extract payer address from the authorization
    let payer = null;
    if (payload.payload && payload.payload.authorization && payload.payload.authorization.from) {
      payer = payload.payload.authorization.from;
    }
    
    return res.status(200).json({ 
      isValid: true,
      payer: payer
    });
  }
  
  console.log('[Mock Facilitator] Invalid payment structure');
  const invalidReason = 'Invalid payment structure';
  return res.status(200).json({ 
    isValid: false, 
    invalidReason: invalidReason
  });
});

// Mock settle endpoint - settles the payment
app.post('/api/v1/settle', (req, res) => {
  console.log('[Mock Facilitator] Received settle request');
  
  const { x402Version, paymentPayload, paymentRequirements } = req.body;
  
  if (!paymentPayload) {
    console.log('[Mock Facilitator] Missing payment payload');
    return res.status(400).json({ 
      x402Version: 1,
      error: 'Missing payment payload' 
    });
  }
  
  console.log('[Mock Facilitator] Settlement payment payload:', JSON.stringify(paymentPayload, null, 2));
  
  if (paymentRequirements) {
    console.log('[Mock Facilitator] Settlement payment requirements:', JSON.stringify(paymentRequirements, null, 2));
  }
  
  // Generate a unique key for this payment
  const paymentKey = JSON.stringify({
    from: paymentPayload.payload?.authorization?.from,
    to: paymentPayload.payload?.authorization?.to,
    value: paymentPayload.payload?.authorization?.value,
    nonce: paymentPayload.payload?.authorization?.nonce
  });
  
  // Check if payment was already settled
  if (usedTokens.has(paymentKey)) {
    console.log('[Mock Facilitator] Payment already settled');
    const errorReason = 'Payment already settled';
    return res.status(200).json({ 
      success: false,
      errorReason: errorReason,
      transaction: '',
      network: paymentPayload.network || ''
    });
  }
  
  // For testing, we'll accept any valid payment structure
  if (paymentPayload && paymentPayload.x402Version === 1 && paymentPayload.scheme === 'exact') {
    usedTokens.add(paymentKey);
    const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    
    console.log('[Mock Facilitator] Payment settled successfully');
    console.log(`[Mock Facilitator] Transaction hash: ${mockTxHash}`);
    
    // Extract payer address
    let payer = null;
    if (paymentPayload.payload?.authorization?.from) {
      payer = paymentPayload.payload.authorization.from;
    }
    
    return res.status(200).json({ 
      success: true,
      transaction: mockTxHash,
      network: paymentPayload.network || 'base-sepolia',
      payer: payer
    });
  }
  
  console.log('[Mock Facilitator] Cannot settle invalid payment');
  const errorReason = 'Invalid payment structure';
  return res.status(200).json({ 
    success: false,
    errorReason: errorReason,
    transaction: '',
    network: paymentPayload.network || ''
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Info endpoint
app.get('/api/v1/info', (req, res) => {
  res.status(200).json({ 
    name: 'Mock x402 Facilitator',
    version: '1.0.0',
    supportedNetworks: ['base-sepolia', 'filecoin-calibration'],
    supportedSchemes: ['exact']
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Mock x402 Facilitator listening at http://0.0.0.0:${port}`);
  console.log('API endpoints:');
  console.log('  POST /api/v1/verify - Verify payment');
  console.log('  POST /api/v1/settle - Settle payment');
  console.log('  GET /api/v1/info - Facilitator information');
  console.log('  GET /health - Health check');
});