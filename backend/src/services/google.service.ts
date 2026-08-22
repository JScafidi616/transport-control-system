import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleUserInfo = {
	sub: string; // Google user ID
	email: string;
	name: string;
	picture?: string;
};

// Cache the JWKS (JSON Web Key Set) to avoid fetching on every request
const mobileJWKS = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));
const webJWKS = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));

export async function verifyGoogleIdToken(
	idToken: string,
	mobileClientId: string,
	webClientId: string,
): Promise<GoogleUserInfo> {
	let lastError: Error | null = null;

	// Try mobile Client ID first
	try {
		const { payload } = await jwtVerify(idToken, mobileJWKS, {
			issuer: GOOGLE_ISSUERS,
		});

		// Verify audience matches mobile Client ID
		if (payload.aud !== mobileClientId) {
			throw new Error('Invalid audience for mobile client');
		}

		return extractUserInfo(payload);
	} catch (err) {
		lastError =
			err instanceof Error ? err : new Error('Mobile verification failed');
	}

	// Try web Client ID
	try {
		const { payload } = await jwtVerify(idToken, webJWKS, {
			issuer: GOOGLE_ISSUERS,
		});

		// Verify audience matches web Client ID
		if (payload.aud !== webClientId) {
			throw new Error('Invalid audience for web client');
		}

		return extractUserInfo(payload);
	} catch (err) {
		lastError =
			err instanceof Error ? err : new Error('Web verification failed');
	}

	throw new Error(`Google token verification failed: ${lastError?.message}`);
}

function extractUserInfo(payload: any): GoogleUserInfo {
	if (!payload.email) {
		throw new Error('Google account does not have an email');
	}

	return {
		sub: payload.sub,
		email: payload.email.toLowerCase(),
		name: payload.name || 'Unknown',
		picture: payload.picture,
	};
}
