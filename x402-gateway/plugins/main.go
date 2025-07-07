// main.go
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"
)

// pluginName is the unique name of this plugin.
const pluginName = "x402-payment-gate"

// HandlerRegisterer is the symbol KrakenD looks for to register the plugin.
// It must be of the type "registerer" and implement the Registerer interface.
var HandlerRegisterer = registerer(pluginName)

type registerer string

// Logger is a KrakenD-compatible logger.
var logger Logger = nil

// Registerer interface implementation.
func (r registerer) RegisterHandlers(f func(
	name string,
	handler func(context.Context, map[string]interface{}, http.Handler) (http.Handler, error),
)) {
	f(string(r), r.registerHandlers)
}

// Custom configuration structure for our plugin.
type pluginConfig struct {
	FacilitatorURL    string `json:"facilitator_url"`
	BackendAPIKey     string `json:"backend_api_key"`
	PaymentHeaderName string `json:"payment_header_name"`
	AuthHeaderName    string `json:"auth_header_name"`
	PaymentAddress    string `json:"payment_address"`
	MaxAmountRequired string `json:"max_amount_required"` // Amount in atomic units
	Network           string `json:"network"`
	Description       string `json:"description"`
	Asset             string `json:"asset"`              // Token contract address
	MaxTimeoutSeconds int    `json:"max_timeout_seconds"` // Payment validity window
	MimeType          string `json:"mime_type"`
}

// Response types for facilitator API
type VerifyResponse struct {
	IsValid       bool    `json:"isValid"`
	InvalidReason *string `json:"invalidReason,omitempty"`
	Payer         *string `json:"payer,omitempty"`
}

type SettleResponse struct {
	Success     bool    `json:"success"`
	ErrorReason *string `json:"errorReason,omitempty"`
	Transaction string  `json:"transaction"`
	Network     string  `json:"network"`
	Payer       *string `json:"payer,omitempty"`
}

// responseWriter wraps http.ResponseWriter to capture the status code and body
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	// Capture the body
	if rw.body != nil {
		rw.body.Write(b)
	}
	return rw.ResponseWriter.Write(b)
}

// This function is called by KrakenD to get our custom handler.
// It parses the configuration and returns the http.HandlerFunc.
func (r registerer) registerHandlers(ctx context.Context, extra map[string]interface{}, next http.Handler) (http.Handler, error) {
	// 1. Parse the plugin configuration from the 'extra' map.
	config, err := parseConfig(extra)
	if err != nil {
		return nil, fmt.Errorf("failed to parse plugin config: %w", err)
	}

	// Create an HTTP client for the facilitator with a timeout.
	// Use a longer timeout for settlement operations on Filecoin
	facilitatorClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Log plugin initialization
	log.Printf("[PLUGIN: x402-payment-gate] Plugin initialized with config: facilitator=%s, payment_address=%s", config.FacilitatorURL, config.PaymentAddress)

	// 2. Return the main HandlerFunc closure.
	// This function will be executed for every request to the endpoint.
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[PLUGIN: x402-payment-gate] Intercepting request: %s %s", r.Method, r.URL.Path)
		paymentHeader := r.Header.Get(config.PaymentHeaderName)

		// Build the resource URL
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		resource := fmt.Sprintf("%s://%s%s", scheme, r.Host, r.RequestURI)

		// 3. Implement the "Payment Required" gate.
		if paymentHeader == "" {
			log.Println("[PLUGIN: x402-gate] Rejecting request: Missing payment header")
			
			// Create extra field with EIP-712 domain configuration
			extraData := map[string]interface{}{
				"name":    "USD for Filecoin Community",
				"version": "1",
			}
			extraJSON, _ := json.Marshal(extraData)
			extraRaw := json.RawMessage(extraJSON)

			// Create payment requirements
			paymentReqs := &PaymentRequirements{
				Scheme:            "exact",
				Network:           config.Network,
				MaxAmountRequired: config.MaxAmountRequired,
				Resource:          resource,
				Description:       config.Description,
				MimeType:          config.MimeType,
				PayTo:             config.PaymentAddress,
				MaxTimeoutSeconds: config.MaxTimeoutSeconds,
				Asset:             config.Asset,
				Extra:             &extraRaw,
			}
			
			// Return 402 with payment requirements in x402-axios expected format
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"x402Version": 1,
				"accepts": []interface{}{paymentReqs},
			})
			return
		}

		// 4. Decode the payment payload from Base64
		paymentJSON, err := base64.StdEncoding.DecodeString(paymentHeader)
		if err != nil {
			log.Printf("[PLUGIN: x402-gate] Failed to decode payment header: %v", err)
			http.Error(w, "Invalid payment header encoding", http.StatusBadRequest)
			return
		}
		
		// Log raw JSON for debugging
		log.Printf("[PLUGIN: x402-payment-gate] Raw payment JSON: %s", string(paymentJSON))

		var paymentPayload PaymentPayload
		if err := json.Unmarshal(paymentJSON, &paymentPayload); err != nil {
			log.Printf("[PLUGIN: x402-gate] Failed to parse payment payload: %v", err)
			http.Error(w, "Invalid payment payload", http.StatusBadRequest)
			return
		}
		
		// Log the parsed payment payload
		log.Printf("[PLUGIN: x402-payment-gate] Parsed payment payload: x402Version=%d, scheme=%s, network=%s", 
			paymentPayload.X402Version, paymentPayload.Scheme, paymentPayload.Network)
		
		// Log the authorization details if present
		if paymentPayload.Payload != nil && paymentPayload.Payload.Authorization != nil {
			auth := paymentPayload.Payload.Authorization
			log.Printf("[PLUGIN: x402-payment-gate] Authorization details: from=%s, to=%s, value=%s, nonce=%s",
				auth.From, auth.To, auth.Value, auth.Nonce)
			log.Printf("[PLUGIN: x402-payment-gate] Signature: %s", paymentPayload.Payload.Signature)
		}

		// Create extra field with EIP-712 domain configuration
		extraData := map[string]interface{}{
			"name":    "USD for Filecoin Community",
			"version": "1",
		}
		extraJSON, _ := json.Marshal(extraData)
		extraRaw := json.RawMessage(extraJSON)

		// Create payment requirements for verification
		paymentReqs := &PaymentRequirements{
			Scheme:            "exact",
			Network:           config.Network,
			MaxAmountRequired: config.MaxAmountRequired,
			Resource:          resource,
			Description:       config.Description,
			MimeType:          config.MimeType,
			PayTo:             config.PaymentAddress,
			MaxTimeoutSeconds: config.MaxTimeoutSeconds,
			Asset:             config.Asset,
			Extra:             &extraRaw,
		}

		// 5. Verify the payment with the facilitator.
		// TEMPORARY: Allow test signature for debugging
		isTestSignature := paymentPayload.Payload != nil && paymentPayload.Payload.Signature == "0xDEBUG_BYPASS"
		
		if isTestSignature {
			log.Println("[PLUGIN: x402-gate] DEBUG: Bypassing payment verification for test")
		} else {
			isValid, err := verifyPayment(r.Context(), facilitatorClient, config.FacilitatorURL, &paymentPayload, paymentReqs)
			if err != nil {
				log.Printf("[PLUGIN: x402-gate] Facilitator verification error: %v", err)
				http.Error(w, "Internal Server Error during payment verification", http.StatusInternalServerError)
				return
			}

			if !isValid {
				log.Printf("[PLUGIN: x402-gate] Rejecting request: Invalid payment")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid Payment"})
				return
			}

			log.Println("[PLUGIN: x402-gate] Payment verified successfully")
		}

		// 6. Perform the authentication handoff.
		// Remove the payment header and add the backend API key header.
		r.Header.Del(config.PaymentHeaderName)
		r.Header.Set(config.AuthHeaderName, config.BackendAPIKey)
		
		// Remove Accept-Encoding header to prevent gzip compression
		// This ensures we get plain JSON responses
		r.Header.Del("Accept-Encoding")
		
		// Log the API key being sent
		log.Printf("[PLUGIN: x402-payment-gate] Sending request to backend with API key header %s: %s", 
			config.AuthHeaderName, config.BackendAPIKey)
		log.Printf("[PLUGIN: x402-payment-gate] Request URL: %s %s", r.Method, r.URL.String())
		
		// Log all headers being sent
		for key, values := range r.Header {
			for _, value := range values {
				if key == config.AuthHeaderName {
					log.Printf("[PLUGIN: x402-payment-gate] Header %s: %s", key, value)
				}
			}
		}

		// Create a custom response writer to capture the response status and body
		bodyBuffer := &bytes.Buffer{}
		rw := &responseWriter{
			ResponseWriter: w, 
			statusCode: http.StatusOK,
			body: bodyBuffer,
		}

		// Delegate the modified request to the next handler in the chain (KrakenD's proxy).
		next.ServeHTTP(rw, r)
		
		// Log the response from the backend
		log.Printf("[PLUGIN: x402-payment-gate] Backend response status: %d", rw.statusCode)
		
		// Log response body (truncate if too large)
		responseBody := bodyBuffer.String()
		if len(responseBody) > 1000 {
			log.Printf("[PLUGIN: x402-payment-gate] Backend response body (first 1000 chars): %s...", responseBody[:1000])
		} else {
			log.Printf("[PLUGIN: x402-payment-gate] Backend response body: %s", responseBody)
		}

		// 7. Settle the payment after successful response
		if rw.statusCode >= 200 && rw.statusCode < 300 {
			if err := settlePayment(r.Context(), facilitatorClient, config.FacilitatorURL, &paymentPayload, paymentReqs); err != nil {
				log.Printf("[PLUGIN: x402-gate] Failed to settle payment: %v", err)
				// Note: We don't fail the request here as the service was already provided
			} else {
				log.Println("[PLUGIN: x402-gate] Payment settled successfully")
			}
		}
	}), nil
}

// Helper function to parse and validate the plugin configuration.
func parseConfig(extra map[string]interface{}) (*pluginConfig, error) {
	raw, ok := extra[pluginName]
	if !ok {
		return nil, errors.New("plugin configuration not found")
	}

	var cfg pluginConfig
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("could not marshal config: %w", err)
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, fmt.Errorf("could not unmarshal config: %w", err)
	}

	// Validate required fields
	if cfg.FacilitatorURL == "" || cfg.BackendAPIKey == "" || cfg.PaymentHeaderName == "" || 
		cfg.AuthHeaderName == "" || cfg.PaymentAddress == "" || cfg.MaxAmountRequired == "" || 
		cfg.Network == "" || cfg.Description == "" || cfg.Asset == "" {
		return nil, errors.New("missing required config fields")
	}

	// Set defaults
	if cfg.MaxTimeoutSeconds == 0 {
		cfg.MaxTimeoutSeconds = 300 // 5 minutes default
	}
	if cfg.MimeType == "" {
		cfg.MimeType = "application/json"
	}

	return &cfg, nil
}

// Helper function to verify the payment with the facilitator.
func verifyPayment(ctx context.Context, client *http.Client, facilitatorURL string, payment *PaymentPayload, requirements *PaymentRequirements) (bool, error) {
	// Create the request body with payment and requirements
	verifyReq := VerifyRequest{
		X402Version:         1,
		PaymentPayload:      payment,
		PaymentRequirements: requirements,
	}
	
	// Marshal the request to JSON
	bodyJSON, err := json.Marshal(verifyReq)
	if err != nil {
		return false, fmt.Errorf("failed to marshal verify request: %w", err)
	}
	
	// Log what we're sending to the facilitator
	log.Printf("[PLUGIN: x402-payment-gate] Sending verify request JSON body: %s", string(bodyJSON))

	// Call the /api/v1/verify endpoint
	verifyURL := facilitatorURL + "/api/v1/verify"
	req, err := http.NewRequestWithContext(ctx, "POST", verifyURL, bytes.NewBuffer(bodyJSON))
	if err != nil {
		return false, fmt.Errorf("failed to create verification request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("facilitator request failed: %w", err)
	}
	defer resp.Body.Close()

	// Parse the response
	var verifyResp VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResp); err != nil {
		return false, fmt.Errorf("failed to decode verification response: %w", err)
	}

	if !verifyResp.IsValid && verifyResp.InvalidReason != nil {
		log.Printf("[PLUGIN: x402-gate] Payment invalid: %s", *verifyResp.InvalidReason)
	}

	return verifyResp.IsValid, nil
}

// Helper function to settle the payment with the facilitator.
func settlePayment(ctx context.Context, client *http.Client, facilitatorURL string, payment *PaymentPayload, requirements *PaymentRequirements) error {
	// Create the request body with payment and requirements
	settleReq := SettleRequest{
		X402Version:         1,
		PaymentPayload:      payment,
		PaymentRequirements: requirements,
	}
	
	// Marshal the request to JSON
	bodyJSON, err := json.Marshal(settleReq)
	if err != nil {
		return fmt.Errorf("failed to marshal settle request: %w", err)
	}
	
	// Log what we're sending to the facilitator
	log.Printf("[PLUGIN: x402-payment-gate] Sending settle request JSON body: %s", string(bodyJSON))

	// Call the /api/v1/settle endpoint
	settleURL := facilitatorURL + "/api/v1/settle"
	req, err := http.NewRequestWithContext(ctx, "POST", settleURL, bytes.NewBuffer(bodyJSON))
	if err != nil {
		return fmt.Errorf("failed to create settlement request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("facilitator request failed: %w", err)
	}
	defer resp.Body.Close()

	// Parse the response
	var settleResp SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResp); err != nil {
		return fmt.Errorf("failed to decode settlement response: %w", err)
	}

	if !settleResp.Success {
		if settleResp.ErrorReason != nil {
			return fmt.Errorf("settlement failed: %s", *settleResp.ErrorReason)
		}
		return errors.New("settlement failed")
	}

	log.Printf("[PLUGIN: x402-gate] Payment settled with transaction hash: %s", settleResp.Transaction)
	return nil
}

// Logger interface and stubs (required by KrakenD plugin system).
type Logger interface {
	Debug(v ...interface{})
	Info(v ...interface{})
	Warning(v ...interface{})
	Error(v ...interface{})
	Critical(v ...interface{})
	Fatal(v ...interface{})
}

func (r registerer) RegisterLogger(v interface{}) {
	l, ok := v.(Logger)
	if !ok {
		return
	}
	logger = l
	logger.Debug(fmt.Sprintf("[PLUGIN: %s] Logger loaded", pluginName))
}

func main() {}