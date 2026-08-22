import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import { registerSchema, loginSchema } from '../utils/validation';
import { registerUser, loginUser } from '../services/user.service';
import { requireAuth } from '../middleware/requireAuth';
import google from './auth/google';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

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
					message: 'Registration successful. Account pending admin approval.',
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
			if (error.message.includes('not on the allowed list')) {
				return c.json<ApiError>(
					{
						success: false,
						error: 'Email not authorized for registration.',
						code: 'NOT_ALLOWED',
					},
					403,
				);
			}
			if (error.message.includes('already registered')) {
				return c.json<ApiError>(
					{
						success: false,
						error: 'Email already registered.',
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

auth.post('/login', async (c) => {
	try {
		const body = await c.req.json();
		const validated = loginSchema.parse(body);

		const user = await loginUser(c.env.DB, validated.email, validated.password);

		// Generate JWT (7 days expiration)
		const secret = new TextEncoder().encode(c.env.JWT_SECRET);
		const token = await new SignJWT({
			email: user.email,
			role: user.role,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setSubject(user.id)
			.setIssuedAt()
			.setExpirationTime('7d')
			.sign(secret);

		return c.json<ApiResponse<{ token: string; user: typeof user }>>({
			success: true,
			data: { token, user },
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

// Test endpoint - will be removed later
auth.get('/me', requireAuth, (c) => {
	const user = c.get('user');
	return c.json({ success: true, data: user });
});

// Mount Google Sign-In route
auth.route('/google', google);

export default auth;
