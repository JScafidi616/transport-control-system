import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables, ApiResponse, ApiError } from '../types';
import {
	startDaySchema,
	updateReportSchema,
	closeDaySchema,
	updateRideSchema,
	updateExpenseSchema,
} from '../utils/validation';
import {
	startDay,
	getTodayReport,
	listReports,
	getReport,
	updateReport,
	closeDay,
} from '../services/dailyReport.service';
import { requireAuth } from '../middleware/requireAuth';
import { requireOwnership } from '../middleware/requireOwnership';
import { addRide } from '../services/ride.service';
import { addExpense } from '../services/expense.service';

const dailyReports = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require authentication
dailyReports.use('*', requireAuth);

// POST /daily-reports/start
dailyReports.post('/start', async (c) => {
	try {
		const body = await c.req.json();
		const validated = startDaySchema.parse(body);
		const user = c.get('user');

		const report = await startDay(
			c.env.DB,
			user.userId,
			validated.startingMileage,
			validated.startingGasoline,
		);

		return c.json<ApiResponse<{ report: typeof report }>>({
			success: true,
			data: { report },
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
			if (error.message.includes('Ya está cerrado')) {
				return c.json<ApiError>(
					{ success: false, error: error.message, code: 'DAY_CLOSED' },
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

// GET /daily-reports/today
dailyReports.get('/today', async (c) => {
	try {
		const user = c.get('user');
		const report = await getTodayReport(c.env.DB, user.userId);

		return c.json<ApiResponse<{ report: typeof report }>>({
			success: true,
			data: { report },
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

// GET /daily-reports
dailyReports.get('/', async (c) => {
	try {
		const user = c.get('user');
		const page = parseInt(c.req.query('page') || '1');
		const limit = parseInt(c.req.query('limit') || '20');

		const result = await listReports(c.env.DB, user.userId, page, limit);

		return c.json<ApiResponse<typeof result>>({
			success: true,
			data: result,
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

// GET /daily-reports/:id
dailyReports.get('/:id', requireOwnership, async (c) => {
	try {
		const report = c.get('report')!;
		const result = await getReport(c.env.DB, report.id);

		if (!result) {
			return c.json<ApiError>(
				{ success: false, error: 'Reporte no encontrado', code: 'NOT_FOUND' },
				404,
			);
		}

		return c.json<ApiResponse<typeof result>>({
			success: true,
			data: result,
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

// PUT /daily-reports/:id
dailyReports.put('/:id', requireOwnership, async (c) => {
	try {
		const report = c.get('report')!;
		const body = await c.req.json();
		const validated = updateReportSchema.parse(body);

		const updatedReport = await updateReport(c.env.DB, report.id, validated);

		return c.json<ApiResponse<{ report: typeof updatedReport }>>({
			success: true,
			data: { report: updatedReport },
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
			if (error.message.includes('No encontrado')) {
				return c.json<ApiError>(
					{ success: false, error: error.message, code: 'NOT_FOUND' },
					404,
				);
			}
			if (
				error.message.includes('cerrado') ||
				error.message.includes('no puede ser')
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

// POST /daily-reports/:id/close
dailyReports.post('/:id/close', requireOwnership, async (c) => {
	try {
		const report = c.get('report')!;
		const body = await c.req.json();
		const validated = closeDaySchema.parse(body);

		const closedReport = await closeDay(
			c.env.DB,
			report.id,
			validated.endingMileage,
			validated.endingGasoline,
			validated.notes,
		);

		return c.json<ApiResponse<{ report: typeof closedReport }>>({
			success: true,
			data: { report: closedReport },
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
			if (error.message.includes('no encontrado')) {
				return c.json<ApiError>(
					{ success: false, error: error.message, code: 'NOT_FOUND' },
					404,
				);
			}
			if (
				error.message.includes('cerrado') ||
				error.message.includes('no puede ser') ||
				error.message.includes('no está configurado')
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

// POST /daily-reports/:id/rides (nested - ride is a sub-resource of the report)
dailyReports.post('/:id/rides', requireOwnership, async (c) => {
	try {
		const report = c.get('report')!; // Already validated by requireOwnership
		const body = await c.req.json();

		// Use the pre-defined updateRideSchema which already omits report_id and has the refine logic
		const validated = updateRideSchema.parse(body);

		const newRide = await addRide(
			c.env.DB,
			report.driver_id,
			report.id,
			validated.amount,
			validated.platform,
			validated.payment_method,
			validated.client_id,
		);

		return c.json<ApiResponse<{ ride: typeof newRide }>>({
			success: true,
			data: { ride: newRide },
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
				error.message.includes('Debe configurar') ||
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

// POST /daily-reports/:id/outcomes (nested - outcome is a sub-resource of the report)
dailyReports.post('/:id/expenses', requireOwnership, async (c) => {
	try {
		const report = c.get('report')!; // Already validated by requireOwnership
		const body = await c.req.json();

		// Use the pre-defined updateOutcomeSchema which already omits report_id
		const validated = updateExpenseSchema.parse(body);

		const newExpense = await addExpense(
			c.env.DB,
			report.driver_id,
			report.id,
			validated.category,
			validated.amount,
			validated.description,
		);

		return c.json<ApiResponse<{ outcome: typeof newExpense }>>({
			success: true,
			data: { outcome: newExpense },
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
				error.message.includes('Debe configurar') ||
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

export default dailyReports;
