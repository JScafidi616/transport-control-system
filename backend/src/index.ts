import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, Variables } from './types';
import health from './routes/health';
import auth from './routes/auth';
import dailyReports from './routes/dailyReports';
import rides from './routes/rides';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', logger());
app.use(
	'*',
	cors({
		origin: ['*'], // TODO: Restrict to specific origins in production
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
);

// Mount routes
app.route('/', health);
app.route('/auth', auth);
app.route('/daily-reports', dailyReports);
app.route('/rides', rides);

// 404 handler
app.notFound((c) => {
	return c.json(
		{
			success: false,
			error: 'Not Found',
			code: 'NOT_FOUND',
		},
		404,
	);
});

// Global error handler
app.onError((err, c) => {
	console.error('Unhandled error:', err);
	// console.error('❌ Error stack:', err.stack); //comment this later

	return c.json(
		{
			success: false,
			error: err.message || 'Internal Server Error',
			code: 'INTERNAL_ERROR',
			// stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
		},
		500,
	);
});

export default app;
