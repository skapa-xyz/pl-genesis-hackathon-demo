import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { parseEther, encodeAbiParameters, keccak256, toBytes, getAddress } from "viem";
import { signTypedData } from "viem/accounts";
import winston from "winston";

// EIP-712 types for ERC-3009 TransferWithAuthorization
const EIP712_TYPES = {
	TransferWithAuthorization: [
		{ name: "from", type: "address" },
		{ name: "to", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "validAfter", type: "uint256" },
		{ name: "validBefore", type: "uint256" },
		{ name: "nonce", type: "bytes32" },
	],
} as const;

// Custom EIP-712 domain for Filecoin Community
const CUSTOM_DOMAIN = {
	name: "USD for Filecoin Community",
	version: "1",
	chainId: 314159, // Filecoin Calibration
} as const;

interface PaymentRequirement {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	resource: string;
	description: string;
	mimeType: string;
	payTo: string;
	maxTimeoutSeconds: number;
	asset: string;
	extra?: {
		name: string;
		version: string;
	};
}

interface PaymentPayload {
	x402Version: number;
	scheme: string;
	network: string;
	payload: {
		signature: string;
		authorization: {
			from: string;
			to: string;
			value: string;
			validAfter: string;
			validBefore: string;
			nonce: string;
		};
	};
}

export function withCustomPaymentInterceptor(
	axiosInstance: AxiosInstance,
	walletClient: any,
	logger?: winston.Logger,
): AxiosInstance {
	// Add response interceptor to handle 402 responses
	axiosInstance.interceptors.response.use(
		(response: AxiosResponse) => response,
		async (error: any) => {
			const originalRequest = error.config;

			// Check if it's a 402 Payment Required response
			if (error.response?.status === 402 && !originalRequest._retry) {
				originalRequest._retry = true;

				try {
					const paymentData = error.response.data;

					// Check for x402 format
					if (paymentData.x402Version && paymentData.accepts) {
						// Select the first payment requirement
						const requirement: PaymentRequirement =
							paymentData.accepts[0];

						// Create payment authorization
						const currentTime = Math.floor(Date.now() / 1000);
						const authorization = {
							from: getAddress(walletClient.account.address),
							to: getAddress(requirement.payTo),
							value: BigInt(requirement.maxAmountRequired),
							validAfter: BigInt(currentTime - 600), // Current time - 600 seconds
							validBefore: BigInt(currentTime + requirement.maxTimeoutSeconds),
							nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`,
						};

						// Log the signing parameters for debugging
						const signingDomain = {
							name: requirement.extra?.name || CUSTOM_DOMAIN.name,
							version: requirement.extra?.version || CUSTOM_DOMAIN.version,
							chainId: CUSTOM_DOMAIN.chainId,
							verifyingContract: getAddress(requirement.asset),
						};

						if (logger) {
							logger.info(
								"[x402-custom] Signing with parameters",
								{
									signingAddress:
										walletClient.account.address,
									domain: signingDomain,
									message: {
										from: authorization.from,
										to: authorization.to,
										value: authorization.value.toString(),
										validAfter:
											authorization.validAfter.toString(),
										validBefore:
											authorization.validBefore.toString(),
										nonce: authorization.nonce,
									},
								},
							);
						}

						// Sign the authorization with custom domain
						const signature = await walletClient.signTypedData({
							domain: signingDomain,
							types: EIP712_TYPES,
							primaryType: "TransferWithAuthorization",
							message: authorization,
						});

						if (logger) {
							logger.info("[x402-custom] Signature created", {
								signature,
								signerAddress: walletClient.account.address,
							});
						}

						// Create payment payload
						const paymentPayload: PaymentPayload = {
							x402Version: 1,
							scheme: requirement.scheme,
							network: requirement.network,
							payload: {
								signature,
								authorization: {
									from: authorization.from,
									to: authorization.to,
									value: authorization.value.toString(),
									validAfter:
										authorization.validAfter.toString(),
									validBefore:
										authorization.validBefore.toString(),
									nonce: authorization.nonce,
								},
							},
						};

						// Encode payment as Base64
						const paymentHeader = Buffer.from(
							JSON.stringify(paymentPayload),
						).toString("base64");

						// Add payment header to the original request
						originalRequest.headers["X-PAYMENT"] = paymentHeader;

						// Log the payment creation to file if logger is provided
						if (logger) {
							logger.info("[x402-custom] Created payment", {
								domain: CUSTOM_DOMAIN.name,
								paymentPayload,
								paymentHeaderLength: paymentHeader.length,
							});
						}

						// Retry the request with payment header
						return axiosInstance(originalRequest);
					}
				} catch (paymentError) {
					if (logger) {
						logger.error("[x402-custom] Error creating payment", {
							error: paymentError,
						});
					}
					throw paymentError;
				}
			}

			return Promise.reject(error);
		},
	);

	return axiosInstance;
}
