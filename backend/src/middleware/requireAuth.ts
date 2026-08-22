import { jwtVerify } from 'jose';
import type { Context, Next } from 'hono';
import type { Env, Variables } from '../types';

export async function requireAuth(
	c: Context<{ Bindings: Env; Variables: Variables }>,
	next: Next,
) {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json(
			{ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
			401,
		);
	}

	const token = authHeader.split(' ')[1];

	try {
		const secret = new TextEncoder().encode(c.env.JWT_SECRET);
		const { payload } = await jwtVerify(token, secret);

		c.set('user', {
			userId: payload.sub as string,
			email: payload.email as string,
			role: payload.role as 'driver' | 'admin',
		});

		await next();
	} catch (err) {
		return c.json(
			{
				success: false,
				error: 'Invalid or expired token',
				code: 'INVALID_TOKEN',
			},
			401,
		);
	}
}
