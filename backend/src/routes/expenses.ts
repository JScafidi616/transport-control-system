import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import { updateExpenseSchema } from '../utils/validation';
import { updateExpense, deleteExpense } from '../services/expense.service';
import { requireAuth } from '../middleware/requireAuth';

const expenses = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require authentication
expenses.use('*', requireAuth);

// PUT /expenses/:id
expenses.put('/:id', async (c) => {
	try {
		const expenseId = c.req.param('id')!;
		const body = await c.req.json();
		const validated = updateExpenseSchema.parse(body);
		const user = c.get('user');

		const updatedExpense = await updateExpense(
			c.env.DB,
			user.userId,
			expenseId,
			validated.category,
			validated.amount,
			validated.description,
		);

		return c.json<ApiResponse<{ outcome: typeof updatedExpense }>>({
			success: true,
			data: { outcome: updatedExpense },
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

// DELETE /expenses/:id
expenses.delete('/:id', async (c) => {
	try {
		const expenseId = c.req.param('id')!;
		const user = c.get('user');

		await deleteExpense(c.env.DB, user.userId, expenseId);

		return c.json<ApiResponse<{ message: string }>>({
			success: true,
			data: { message: 'Gasto eliminado exitosamente' },
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

export default expenses;
