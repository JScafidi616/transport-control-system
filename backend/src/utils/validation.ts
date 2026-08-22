import { z } from 'zod';

export const registerSchema = z.object({
	email: z.string().email('Invalid email format').toLowerCase(),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	fullName: z.string().min(2, 'Full name must be at least 2 characters'),
});

export const loginSchema = z.object({
	email: z.string().email('Invalid email format').toLowerCase(),
	password: z.string().min(1, 'Password is required'),
});

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

// 1. Define the base ZodObject FIRST (this has the .omit() method)
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

// 2. Apply .refine() to the base object for CREATING a ride
export const rideSchema = baseRideObject.refine(
	(data) => data.payment_method !== 'credito' || !!data.client_id,
	{
		message: 'El client_id es obligatorio cuando el método de pago es credito',
		path: ['client_id'],
	},
);

// 3. Use .omit() on the BASE OBJECT, then apply .refine() for UPDATING a ride
export const updateRideSchema = baseRideObject
	.omit({ report_id: true })
	.refine((data) => data.payment_method !== 'credito' || !!data.client_id, {
		message: 'El client_id es obligatorio cuando el método de pago es credito',
		path: ['client_id'],
	});
