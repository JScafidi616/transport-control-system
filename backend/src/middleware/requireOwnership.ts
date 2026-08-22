import type { Context, Next } from 'hono';
import type { Env, Variables, DailyReport } from '../types';

export async function requireOwnership(
	c: Context<{ Bindings: Env; Variables: Variables }>,
	next: Next,
): Promise<Response | void> {
	const reportId = c.req.param('id');
	const user = c.get('user');

	if (!reportId) {
		return c.json(
			{ success: false, error: 'Report ID required', code: 'MISSING_ID' },
			400,
		);
	}

	const report = await c.env.DB.prepare(
		'SELECT * FROM daily_reports WHERE id = ?',
	)
		.bind(reportId)
		.first<DailyReport>();

	if (!report) {
		return c.json(
			{ success: false, error: 'Report not found', code: 'NOT_FOUND' },
			404,
		);
	}

	// Admin can access any report
	if (user.role === 'admin') {
		c.set('report', report);
		await next();
		return;
	}

	// Driver can only access their own reports
	if (report.driver_id !== user.userId) {
		return c.json(
			{ success: false, error: 'Forbidden', code: 'FORBIDDEN' },
			403,
		);
	}

	c.set('report', report);
	await next();
}
