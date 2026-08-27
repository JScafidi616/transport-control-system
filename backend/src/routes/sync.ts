import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import { syncRequestSchema } from '../utils/validation';
import { syncData } from '../services/sync.service';
import { requireAuth } from '../middleware/requireAuth';

const sync = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require authentication
sync.use('*', requireAuth);

// POST /sync
sync.post('/', async (c) => {
	try {
		const body = await c.req.json();
		const validated = syncRequestSchema.parse(body);
		const user = c.get('user');

		const result = await syncData(
			c.env.DB,
			user.userId,
			validated.last_sync_at,
			validated.changes,
		);

		return c.json<
			ApiResponse<{
				sync_timestamp: number;
				changes: typeof result.serverChanges;
				conflicts: typeof result.conflicts;
				errors: typeof result.errors;
			}>
		>({
			success: true,
			data: {
				sync_timestamp: result.newSyncTimestamp,
				changes: result.serverChanges,
				conflicts: result.conflicts,
				errors: result.errors,
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

export default sync;
