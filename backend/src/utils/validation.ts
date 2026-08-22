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
