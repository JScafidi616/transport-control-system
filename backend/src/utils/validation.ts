import { z } from 'zod';

//
// region schemas auth
//
export const registerSchema = z.object({
	email: z.string().email('Invalid email format').toLowerCase(),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	fullName: z.string().min(2, 'Full name must be at least 2 characters'),
});

export const loginSchema = z.object({
	email: z.string().email('Invalid email format').toLowerCase(),
	password: z.string().min(1, 'Password is required'),
});

//
// region schemas daily reports
//
export const startDaySchema = z.object({
	startingMileage: z.number().int().min(0, 'Starting mileage must be positive'),
	startingGasoline: z
		.number()
		.int()
		.min(0, 'Starting gasoline must be positive'),
});

export const updateReportSchema = z.object({
	endingMileage: z.number().int().min(0).optional(),
	endingGasoline: z.number().int().min(0).optional(),
	notes: z.string().optional(),
});

export const closeDaySchema = z.object({
	endingMileage: z.number().int().min(0, 'Ending mileage must be positive'),
	endingGasoline: z.number().int().min(0, 'Ending gasoline must be positive'),
	notes: z.string().optional(),
});

//
// region schemas rides
//
const baseRideObject = z.object({
	report_id: z.string().uuid('ID de reporte inválido'),
	amount: z.number().int().min(1, 'El monto debe ser mayor a 0'),
	platform: z.enum(['uber', 'didi', 'fuera de plataforma'], {
		errorMap: () => ({ message: 'Plataforma inválida' }),
	}),
	payment_method: z.enum(['efectivo', 'sinpe', 'credito'], {
		errorMap: () => ({ message: 'Método de pago inválido' }),
	}),
	client_id: z.string().uuid().optional(),
});

export const rideSchema = baseRideObject.refine(
	(data) => data.payment_method !== 'credito' || !!data.client_id,
	{
		message: 'El client_id es obligatorio cuando el método de pago es credito',
		path: ['client_id'],
	},
);

export const updateRideSchema = baseRideObject
	.omit({ report_id: true })
	.refine((data) => data.payment_method !== 'credito' || !!data.client_id, {
		message: 'El client_id es obligatorio cuando el método de pago es credito',
		path: ['client_id'],
	});

//
// region schemas expenses
//
const baseExpenseObject = z.object({
	report_id: z.string().uuid('ID de reporte inválido'),
	category: z.enum(
		['gasolina', 'personal', 'alimentacion', 'medicina', 'other'],
		{
			errorMap: () => ({ message: 'Categoría inválida' }),
		},
	),
	amount: z.number().int().min(1, 'El monto debe ser mayor a 0'),
	description: z.string().optional(),
});

export const expenseSchema = baseRideObject.refine((data) => data.amount > 0, {
	message: 'El monto debe ser mayor a 0',
	path: ['amount'],
});

export const updateExpenseSchema = baseExpenseObject
	.omit({ report_id: true })
	.refine((data) => data.amount > 0, {
		message: 'El monto debe ser mayor a 0',
		path: ['amount'],
	});

//
// region schemas sync
//
const syncEntityFields = {
	id: z.string().uuid(),
	updated_at: z.number().int(),
	deleted_at: z.number().int().nullable(),
};

const dailyReportSyncSchema = z.object({
	...syncEntityFields,
	driver_id: z.string().uuid(),
	report_date: z.string(),
	starting_mileage: z.number().nullable(),
	ending_mileage: z.number().nullable(),
	distance_driven: z.number().nullable(),
	starting_gasoline: z.number().nullable(),
	ending_gasoline: z.number().nullable(),
	notes: z.string().nullable(),
	status: z.enum(['borrador', 'cerrado']),
	submitted_at: z.number().int().nullable(),
	created_at: z.number().int(),
	deleted_at: z.number().int().nullable(),
});

const rideSyncSchema = z.object({
	...syncEntityFields,
	daily_report_id: z.string().uuid(),
	amount: z.number(),
	platform: z.string(),
	payment_method: z.string(),
	client_id: z.string().uuid().nullable(),
	is_late_addition: z.number().int(),
	created_at: z.number().int(),
	deleted_at: z.number().int().nullable(),
});

const expensesSyncSchema = z.object({
	...syncEntityFields,
	daily_report_id: z.string().uuid(),
	category: z.string(),
	amount: z.number(),
	description: z.string(),
	created_at: z.number().int(),
	deleted_at: z.number().int().nullable(),
});

const clientSyncSchema = z.object({
	...syncEntityFields,
	driver_id: z.string().uuid(),
	full_name: z.string(),
	phone: z.number().nullable(),
	created_at: z.number().int(),
	deleted_at: z.number().int().nullable(),
});

const creditPaymentSyncSchema = z.object({
	...syncEntityFields,
	client_id: z.string().uuid(),
	amount: z.number(),
	payment_date: z.string(),
	notes: z.string().nullable(),
	created_at: z.number().int(),
});

export const syncRequestSchema = z
	.object({
		last_sync_at: z.number().int().optional(),
		changes: z.object({
			daily_reports: z.array(dailyReportSyncSchema).optional(),
			rides: z.array(rideSyncSchema).optional(),
			expenses: z.array(expensesSyncSchema).optional(),
			clients: z.array(clientSyncSchema).optional(),
			credit_payments: z.array(creditPaymentSyncSchema).optional(),
		}),
	})
	.refine(
		(data) => {
			const totalEntities =
				(data.changes.daily_reports?.length || 0) +
				(data.changes.rides?.length || 0) +
				(data.changes.expenses?.length || 0) +
				(data.changes.clients?.length || 0) +
				(data.changes.credit_payments?.length || 0);
			return totalEntities <= 1000;
		},
		{
			message: 'Máximo 1000 entidades por sincronización',
		},
	);
