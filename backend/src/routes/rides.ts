import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import { updateRideSchema } from '../utils/validation';
import { updateRide, deleteRide } from '../services/ride.service';
import { requireAuth } from '../middleware/requireAuth';

const rides = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require authentication
rides.use('*', requireAuth);

// PUT /rides/:id
rides.put('/:id', async (c) => {
	try {
		const rideId = c.req.param('id')!;
		const body = await c.req.json();
		const validated = updateRideSchema.parse(body);
		const user = c.get('user');

		const updatedRide = await updateRide(
			c.env.DB,
			user.userId,
			rideId,
			validated.amount,
			validated.platform,
			validated.payment_method,
			validated.client_id,
		);

		return c.json<ApiResponse<{ ride: typeof updatedRide }>>({
			success: true,
			data: { ride: updatedRide },
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
				error.message.includes('cerrado') ||
				error.message.includes('permiso') ||
				error.message.includes('no encontrado')
			) {
				return c.json<ApiError>(
					{ success: false, error: error.message, code: 'VALIDATION_ERROR' },
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

// DELETE /rides/:id
rides.delete('/:id', async (c) => {
	try {
		const rideId = c.req.param('id')!;
		const user = c.get('user');

		await deleteRide(c.env.DB, user.userId, rideId);

		return c.json<ApiResponse<{ message: string }>>({
			success: true,
			data: { message: 'Viaje eliminado exitosamente' },
		});
	} catch (error) {
		if (error instanceof Error) {
			if (
				error.message.includes('cerrado') ||
				error.message.includes('permiso') ||
				error.message.includes('no encontrado')
			) {
				return c.json<ApiError>(
					{ success: false, error: error.message, code: 'VALIDATION_ERROR' },
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

export default rides;
