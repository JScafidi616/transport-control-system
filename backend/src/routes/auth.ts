import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import {
	registerSchema,
	loginSchema,
	refreshTokenSchema,
} from '../utils/validation';
import { registerUser, loginUser } from '../services/user.service';
import {
	createRefreshToken,
	validateRefreshToken,
	logoutUser,
	getUserProfile,
	ACCESS_TOKEN_EXPIRY,
} from '../services/auth.service';
import { requireAuth } from '../middleware/requireAuth';
import google from './auth/google';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Helper: Generate access token (JWT)
 */
async function generateAccessToken(
	jwtSecret: string,
	userId: string,
	email: string,
	role: 'driver' | 'admin',
): Promise<string> {
	const secret = new TextEncoder().encode(jwtSecret);
	return await new SignJWT({ email, role })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(userId)
		.setIssuedAt()
		.setExpirationTime(ACCESS_TOKEN_EXPIRY)
		.sign(secret);
}

// POST /auth/register
auth.post('/register', async (c) => {
	try {
		const body = await c.req.json();
		const validated = registerSchema.parse(body);

		await registerUser(
			c.env.DB,
			validated.email,
			validated.password,
			validated.fullName,
		);

		return c.json<ApiResponse<{ message: string }>>(
			{
				success: true,
				data: {
					message:
						'Registro exitoso. Cuenta pendiente de aprobación del administrador.',
				},
			},
			201,
		);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json<ApiError>(
				{
					success: false,
					error: error.errors[0].message,
					code: 'VALIDATION_ERROR',
				},
				400,
			);
		}
		if (error instanceof Error) {
			if (
				error.message.includes('not on the allowed list') ||
				error.message.includes('allowed list')
			) {
				return c.json<ApiError>(
					{
						success: false,
						error: 'Email no autorizado para registro.',
						code: 'NOT_ALLOWED',
					},
					403,
				);
			}
			if (error.message.includes('already registered')) {
				return c.json<ApiError>(
					{
						success: false,
						error: 'Email ya registrado.',
						code: 'EMAIL_EXISTS',
					},
					400,
				);
			}
		}
		return c.json<ApiError>(
			{
				success: false,
				error: 'Internal Server Error',
				code: 'INTERNAL_ERROR',
			},
			500,
		);
	}
});

// POST /auth/login
auth.post('/login', async (c) => {
	try {
		const body = await c.req.json();
		const validated = loginSchema.parse(body);

		// Optional device info from client
		const deviceInfo = c.req.header('X-Device-Info') || undefined;

		const user = await loginUser(c.env.DB, validated.email, validated.password);

		// Generate access token (JWT, 7 days)
		const accessToken = await generateAccessToken(
			c.env.JWT_SECRET,
			user.id,
			user.email,
			user.role,
		);

		// Create refresh token (revokes previous ones - single device policy)
		const { token: refreshToken } = await createRefreshToken(
			c.env.DB,
			user.id,
			deviceInfo,
		);

		// Get full user profile for client cache
		const profile = await getUserProfile(c.env.DB, user.id);

		return c.json<
			ApiResponse<{
				accessToken: string;
				refreshToken: string;
				user: typeof profile;
			}>
		>({
			success: true,
			data: {
				accessToken,
				refreshToken,
				user: profile,
			},
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json<ApiError>(
				{
					success: false,
					error: error.errors[0].message,
					code: 'VALIDATION_ERROR',
				},
				400,
			);
		}
		if (error instanceof Error) {
			if (
				error.message.includes('pending') ||
				error.message.includes('rejected')
			) {
				return c.json<ApiError>(
					{
						success: false,
						error: error.message,
						code: 'ACCOUNT_NOT_APPROVED',
					},
					403,
				);
			}
			return c.json<ApiError>(
				{ success: false, error: error.message, code: 'INVALID_CREDENTIALS' },
				401,
			);
		}
		return c.json<ApiError>(
			{
				success: false,
				error: 'Internal Server Error',
				code: 'INTERNAL_ERROR',
			},
			500,
		);
	}
});

// POST /auth/refresh
auth.post('/refresh', async (c) => {
	try {
		const body = await c.req.json();
		const validated = refreshTokenSchema.parse(body);

		// Validate the refresh token
		const tokenData = await validateRefreshToken(
			c.env.DB,
			validated.refreshToken,
		);

		if (!tokenData) {
			return c.json<ApiError>(
				{
					success: false,
					error:
						'Refresh token inválido o expirado. Por favor inicia sesión de nuevo.',
					code: 'INVALID_REFRESH_TOKEN',
				},
				401,
			);
		}

		// Get user info
		const profile = await getUserProfile(c.env.DB, tokenData.userId);
		if (!profile) {
			return c.json<ApiError>(
				{
					success: false,
					error: 'Usuario no encontrado',
					code: 'USER_NOT_FOUND',
				},
				404,
			);
		}

		// Generate new access token (refresh token stays the same - no rotation)
		const accessToken = await generateAccessToken(
			c.env.JWT_SECRET,
			profile.id,
			profile.email,
			profile.role,
		);

		return c.json<
			ApiResponse<{
				accessToken: string;
				user: typeof profile;
			}>
		>({
			success: true,
			data: {
				accessToken,
				user: profile,
			},
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json<ApiError>(
				{
					success: false,
					error: error.errors[0].message,
					code: 'VALIDATION_ERROR',
				},
				400,
			);
		}
		return c.json<ApiError>(
			{
				success: false,
				error: 'Internal Server Error',
				code: 'INTERNAL_ERROR',
			},
			500,
		);
	}
});

// POST /auth/logout
auth.post('/logout', requireAuth, async (c) => {
	try {
		const user = c.get('user');

		// Revoke ALL refresh tokens for this user (single device policy)
		await logoutUser(c.env.DB, user.userId);

		return c.json<ApiResponse<{ message: string }>>({
			success: true,
			data: { message: 'Sesión cerrada exitosamente' },
		});
	} catch (error) {
		return c.json<ApiError>(
			{
				success: false,
				error: 'Internal Server Error',
				code: 'INTERNAL_ERROR',
			},
			500,
		);
	}
});

// Test endpoint - will be removed later
auth.get('/me', requireAuth, (c) => {
	const user = c.get('user');
	return c.json({ success: true, data: user });
});

// Mount Google Sign-In route
auth.route('/google', google);

export default auth;
