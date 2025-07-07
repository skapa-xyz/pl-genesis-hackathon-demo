package main

import "encoding/json"

// PaymentRequirements represents the payment requirements for accessing a resource
type PaymentRequirements struct {
	Scheme            string           `json:"scheme"`
	Network           string           `json:"network"`
	MaxAmountRequired string           `json:"maxAmountRequired"`
	Resource          string           `json:"resource"`
	Description       string           `json:"description"`
	MimeType          string           `json:"mimeType"`
	PayTo             string           `json:"payTo"`
	MaxTimeoutSeconds int              `json:"maxTimeoutSeconds"`
	Asset             string           `json:"asset"`
	OutputSchema      *json.RawMessage `json:"outputSchema,omitempty"`
	Extra             *json.RawMessage `json:"extra,omitempty"`
}

// PaymentPayload represents the payment payload sent by the client
type PaymentPayload struct {
	X402Version int              `json:"x402Version"`
	Scheme      string           `json:"scheme"`
	Network     string           `json:"network"`
	Payload     *ExactEvmPayload `json:"payload"`
}

// ExactEvmPayload represents the ERC-3009 payment details
type ExactEvmPayload struct {
	Signature     string                        `json:"signature"`
	Authorization *ExactEvmPayloadAuthorization `json:"authorization"`
}

// ExactEvmPayloadAuthorization represents the authorization details
type ExactEvmPayloadAuthorization struct {
	From        string `json:"from"`
	To          string `json:"to"`
	Value       string `json:"value"`
	ValidAfter  string `json:"validAfter"`
	ValidBefore string `json:"validBefore"`
	Nonce       string `json:"nonce"`
}

// VerifyRequest represents the JSON body for the verify endpoint
type VerifyRequest struct {
	X402Version         int                  `json:"x402Version"`
	PaymentPayload      *PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements *PaymentRequirements `json:"paymentRequirements"`
}

// SettleRequest represents the JSON body for the settle endpoint
type SettleRequest struct {
	X402Version         int                  `json:"x402Version"`
	PaymentPayload      *PaymentPayload      `json:"paymentPayload"`
	PaymentRequirements *PaymentRequirements `json:"paymentRequirements"`
}