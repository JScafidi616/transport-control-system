import type { D1Database } from '@cloudflare/workers-types';

export async function addRide(
	db: D1Database,
	userId: string,
	reportId: string,
	amount: number,
	platform: string,
	payment_method: string,
	client_id?: string,
) {
	const report = await db
		.prepare(
			'SELECT id, status, starting_mileage, starting_gasoline FROM daily_reports WHERE id = ? AND driver_id = ?',
		)
		.bind(reportId, userId)
		.first();

	if (!report) throw new Error('Reporte no encontrado o no tienes permiso');
	if (report.status === 'cerrado')
		throw new Error('No se pueden agregar viajes a un reporte cerrado');
	if (report.starting_mileage === null || report.starting_gasoline === null) {
		throw new Error(
			'Debe configurar el kilometraje y gasolina inicial antes de agregar viajes',
		);
	}

	const rideId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO rides (id, daily_report_id, amount, platform, payment_method, client_id, is_late_addition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
		)
		.bind(
			rideId,
			reportId,
			amount,
			platform,
			payment_method,
			client_id || null,
			now,
			now,
		)
		.run();

	return await db
		.prepare('SELECT * FROM rides WHERE id = ?')
		.bind(rideId)
		.first();
}

export async function updateRide(
	db: D1Database,
	userId: string,
	rideId: string,
	amount: number,
	platform: string,
	payment_method: string,
	client_id?: string,
) {
	const ride = await db
		.prepare(
			`SELECT r.id, dr.status, dr.driver_id FROM rides r JOIN daily_reports dr ON r.daily_report_id = dr.id WHERE r.id = ?`,
		)
		.bind(rideId)
		.first();

	if (!ride) throw new Error('Viaje no encontrado');
	if (ride.driver_id !== userId)
		throw new Error('No tienes permiso para modificar este viaje');
	if (ride.status === 'cerrado')
		throw new Error('No se pueden actualizar viajes de un reporte cerrado');

	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`UPDATE rides SET amount = ?, platform = ?, payment_method = ?, client_id = ?, updated_at = ? WHERE id = ?`,
		)
		.bind(amount, platform, payment_method, client_id || null, now, rideId)
		.run();

	return await db
		.prepare('SELECT * FROM rides WHERE id = ?')
		.bind(rideId)
		.first();
}

export async function deleteRide(
	db: D1Database,
	userId: string,
	rideId: string,
) {
	const ride = await db
		.prepare(
			`SELECT r.id, dr.status, dr.driver_id FROM rides r JOIN daily_reports dr ON r.daily_report_id = dr.id WHERE r.id = ?`,
		)
		.bind(rideId)
		.first();

	if (!ride) throw new Error('Viaje no encontrado');
	if (ride.driver_id !== userId)
		throw new Error('No tienes permiso para eliminar este viaje');
	if (ride.status === 'cerrado')
		throw new Error('No se pueden eliminar viajes de un reporte cerrado');

	await db.prepare('DELETE FROM rides WHERE id = ?').bind(rideId).run();
}
