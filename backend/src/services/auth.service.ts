import type { D1Database } from '@cloudflare/workers-types';
import type { UserProfile } from '../types';

const ACCESS_TOKEN_EXPIRY = '7d'; // 7 días
const REFRESH_TOKEN_EXPIRY_DAYS = 90; // 90 días

/**
 * Hash a refresh token using SHA-256
 * We store the hash, not the raw token, for security
 */
export async function hashRefreshToken(token: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random refresh token
 */
export function generateRefreshToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Revoke all existing refresh tokens for a user (single device policy)
 */
export async function revokeAllUserTokens(
	db: D1Database,
	userId: string,
): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`UPDATE refresh_tokens 
       SET revoked_at = ? 
       WHERE user_id = ? AND revoked_at IS NULL`,
		)
		.bind(now, userId)
		.run();
}

/**
 * Create a new refresh token for a user
 * Revokes all previous tokens first (single device policy)
 */
export async function createRefreshToken(
	db: D1Database,
	userId: string,
	deviceInfo?: string,
): Promise<{ token: string; expiresAt: number }> {
	// Revoke all existing tokens for this user (single device)
	await revokeAllUserTokens(db, userId);

	const rawToken = generateRefreshToken();
	const tokenHash = await hashRefreshToken(rawToken);
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
	const tokenId = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(tokenId, userId, tokenHash, deviceInfo || null, expiresAt, now)
		.run();

	return { token: rawToken, expiresAt };
}

/**
 * Validate a refresh token and return the user ID
 */
export async function validateRefreshToken(
	db: D1Database,
	rawToken: string,
): Promise<{ userId: string; expiresAt: number } | null> {
	const tokenHash = await hashRefreshToken(rawToken);
	const now = Math.floor(Date.now() / 1000);

	const token = await db
		.prepare(
			`SELECT user_id, expires_at, revoked_at 
       FROM refresh_tokens 
       WHERE token_hash = ?`,
		)
		.bind(tokenHash)
		.first<{
			user_id: string;
			expires_at: number;
			revoked_at: number | null;
		}>();

	if (!token) return null;
	if (token.revoked_at !== null) return null;
	if (token.expires_at < now) return null;

	return { userId: token.user_id, expiresAt: token.expires_at };
}

/**
 * Revoke all refresh tokens for a user (logout)
 */
export async function logoutUser(
	db: D1Database,
	userId: string,
): Promise<void> {
	await revokeAllUserTokens(db, userId);
}

/**
 * Get user profile for caching on the client
 */
export async function getUserProfile(
	db: D1Database,
	userId: string,
): Promise<UserProfile | null> {
	const user = await db
		.prepare(
			`SELECT id, email, full_name, role 
       FROM users 
       WHERE id = ? AND status = 'approved'`,
		)
		.bind(userId)
		.first<{
			id: string;
			email: string;
			full_name: string;
			role: 'driver' | 'admin';
		}>();

	if (!user) return null;

	return {
		id: user.id,
		email: user.email,
		fullName: user.full_name,
		role: user.role,
	};
}

export { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY_DAYS };
