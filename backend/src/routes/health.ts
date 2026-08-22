import { Hono } from 'hono';
import type { Env } from '../types';

type Variables = {
	// Will be used later for auth context
};

const health = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /health
 * Basic health check that also verifies D1 database connection
 */
health.get('/health', async (c) => {
	const startTime = Date.now();

	let dbStatus: 'ok' | 'error' = 'ok';
	let dbError: string | null = null;

	try {
		// Simple query to verify DB connection
		await c.env.DB.prepare('SELECT 1 as test').first();
	} catch (err) {
		dbStatus = 'error';
		dbError = err instanceof Error ? err.message : 'Unknown error';
	}

	const responseTime = Date.now() - startTime;

	return c.json({
		status: dbStatus === 'ok' ? 'healthy' : 'degraded',
		timestamp: new Date().toISOString(),
		responseTimeMs: responseTime,
		database: {
			status: dbStatus,
			error: dbError,
		},
		version: '1.0.0',
	});
});

export default health;
