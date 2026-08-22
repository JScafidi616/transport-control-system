import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../../types';
import { verifyGoogleIdToken } from '../../services/google.service';
import { loginOrRegisterWithGoogle } from '../../services/user.service';

const google = new Hono<{ Bindings: Env; Variables: Variables }>();

const googleLoginSchema = z.object({
	idToken: z.string().min(1, 'ID token is required'),
});

google.post('/', async (c) => {
	try {
		const body = await c.req.json();
		const validated = googleLoginSchema.parse(body);

		// Verify Google ID token
		const googleUser = await verifyGoogleIdToken(
			validated.idToken,
			c.env.GOOGLE_CLIENT_ID_MOBILE,
			c.env.GOOGLE_CLIENT_ID_WEB,
		);

		// Login or register user
		const result = await loginOrRegisterWithGoogle(
			c.env.DB,
			googleUser.sub,
			googleUser.email,
			googleUser.name,
		);

		// If new user or pending, return message without token
		if (result.isNewUser) {
			return c.json<ApiResponse<{ message: string }>>(
				{
					success: true,
					data: {
						message: 'Registration successful. Account pending admin approval.',
					},
				},
				201,
			);
		}

		// Generate JWT for approved user
		const secret = new TextEncoder().encode(c.env.JWT_SECRET);
		const token = await new SignJWT({
			email: result.email,
			role: result.role,
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setSubject(result.id)
			.setIssuedAt()
			.setExpirationTime('7d')
			.sign(secret);

		return c.json<ApiResponse<{ token: string; user: typeof result }>>({
			success: true,
			data: { token, user: result },
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
			if (
				error.message.includes('verification failed') ||
				error.message.includes('Invalid')
			) {
				return c.json<ApiError>(
					{
						success: false,
						error: 'Invalid Google token.',
						code: 'INVALID_TOKEN',
					},
					401,
				);
			}
			return c.json<ApiError>(
				{
					success: false,
					error: error.message,
					code: 'GOOGLE_AUTH_ERROR',
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

export default google;
