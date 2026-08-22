import type { D1Database } from '@cloudflare/workers-types';

export async function addExpense(
	db: D1Database,
	userId: string,
	reportId: string,
	category: string,
	amount: number,
	description?: string,
) {
	const report = await db
		.prepare(
			'SELECT id, status, starting_mileage, starting_gasoline FROM daily_reports WHERE id = ? AND driver_id = ?',
		)
		.bind(reportId, userId)
		.first();

	if (!report) throw new Error('Reporte no encontrado o no tienes permiso');
	if (report.status === 'cerrado')
		throw new Error('No se pueden agregar gastos a un reporte cerrado');
	if (report.starting_mileage === null || report.starting_gasoline === null) {
		throw new Error(
			'Debe configurar el kilometraje y gasolina inicial antes de agregar gastos',
		);
	}

	const expenseId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO outcomes (id, daily_report_id, category, amount, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(expenseId, reportId, category, amount, description || null, now, now)
		.run();

	return await db
		.prepare('SELECT * FROM outcomes WHERE id = ?')
		.bind(expenseId)
		.first();
}

export async function updateExpense(
	db: D1Database,
	userId: string,
	expenseId: string,
	category: string,
	amount: number,
	description?: string,
) {
	const expense = await db
		.prepare(
			`SELECT o.id, dr.status, dr.driver_id FROM outcomes o JOIN daily_reports dr ON o.daily_report_id = dr.id WHERE o.id = ?`,
		)
		.bind(expenseId)
		.first();

	if (!expense) throw new Error('Gasto no encontrado');
	if (expense.driver_id !== userId)
		throw new Error('No tienes permiso para modificar este gasto');
	if (expense.status === 'cerrado')
		throw new Error('No se pueden actualizar gastos de un reporte cerrado');

	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`UPDATE outcomes SET category = ?, amount = ?, description = ?, updated_at = ? WHERE id = ?`,
		)
		.bind(category, amount, description || null, now, expenseId)
		.run();

	return await db
		.prepare('SELECT * FROM outcomes WHERE id = ?')
		.bind(expenseId)
		.first();
}

export async function deleteExpense(
	db: D1Database,
	userId: string,
	expenseId: string,
) {
	const expense = await db
		.prepare(
			`SELECT o.id, dr.status, dr.driver_id FROM outcomes o JOIN daily_reports dr ON o.daily_report_id = dr.id WHERE o.id = ?`,
		)
		.bind(expenseId)
		.first();

	if (!expense) throw new Error('Gasto no encontrado');
	if (expense.driver_id !== userId)
		throw new Error('No tienes permiso para eliminar este gasto');
	if (expense.status === 'cerrado')
		throw new Error('No se pueden eliminar gastos de un reporte cerrado');

	await db.prepare('DELETE FROM outcomes WHERE id = ?').bind(expenseId).run();
}
