import type { DailyReport } from '../types';
import type { D1Database } from '@cloudflare/workers-types';
import { getCostaRicaToday } from '../utils/timezone';

export async function startDay(
	db: D1Database,
	driverId: string,
	startingMileage: number,
	startingGasoline: number,
): Promise<DailyReport> {
	const today = getCostaRicaToday();

	// Check if report exists for today
	const existing = await db
		.prepare(
			'SELECT * FROM daily_reports WHERE driver_id = ? AND report_date = ?',
		)
		.bind(driverId, today)
		.first<DailyReport>();

	if (existing) {
		if (existing.status === 'cerrado') {
			throw new Error('Day already closed');
		}
		return existing; // Return existing draft
	}

	// Create new draft
	const reportId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO daily_reports 
       (id, driver_id, report_date, starting_mileage, starting_gasoline, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?)`,
		)
		.bind(
			reportId,
			driverId,
			today,
			startingMileage,
			startingGasoline,
			now,
			now,
		)
		.run();

	const newReport = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!newReport) {
		throw new Error('Failed to create daily report');
	}

	return newReport;
}

export async function getTodayReport(
	db: D1Database,
	driverId: string,
): Promise<DailyReport | null> {
	const today = getCostaRicaToday();

	return await db
		.prepare(
			'SELECT * FROM daily_reports WHERE driver_id = ? AND report_date = ?',
		)
		.bind(driverId, today)
		.first<DailyReport>();
}

export async function listReports(
	db: D1Database,
	driverId: string,
	page: number = 1,
	limit: number = 20,
): Promise<{ reports: DailyReport[]; total: number }> {
	const offset = (page - 1) * limit;

	const [reports, countResult] = await Promise.all([
		db
			.prepare(
				'SELECT * FROM daily_reports WHERE driver_id = ? ORDER BY report_date DESC LIMIT ? OFFSET ?',
			)
			.bind(driverId, limit, offset)
			.all<DailyReport>(),
		db
			.prepare(
				'SELECT COUNT(*) as count FROM daily_reports WHERE driver_id = ?',
			)
			.bind(driverId)
			.first<{ count: number }>(),
	]);

	return {
		reports: reports.results,
		total: countResult?.count || 0,
	};
}

export async function getReport(
	db: D1Database,
	reportId: string,
): Promise<{
	report: DailyReport;
	rides: any[];
	outcomes: any[];
	summary: {
		totalIncome: number;
		totalExpenses: number;
		netProfit: number;
		totalCredit: number;
		platformBreakdown: Record<string, number>;
	};
} | null> {
	const report = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!report) {
		return null;
	}

	const [rides, outcomes] = await Promise.all([
		db
			.prepare('SELECT * FROM rides WHERE daily_report_id = ?')
			.bind(reportId)
			.all(),
		db
			.prepare('SELECT * FROM outcomes WHERE daily_report_id = ?')
			.bind(reportId)
			.all(),
	]);

	// Calculate summary
	const totalIncome = rides.results
		.filter((r: any) => r.payment_method !== 'credit')
		.reduce((sum: number, r: any) => sum + r.amount, 0);

	const totalCredit = rides.results
		.filter((r: any) => r.payment_method === 'credit')
		.reduce((sum: number, r: any) => sum + r.amount, 0);

	const totalExpenses = outcomes.results.reduce(
		(sum: number, o: any) => sum + o.amount,
		0,
	);

	const platformBreakdown: Record<string, number> = {};
	rides.results.forEach((r: any) => {
		const platform = r.platform || 'off_platform';
		platformBreakdown[platform] = (platformBreakdown[platform] || 0) + r.amount;
	});

	return {
		report,
		rides: rides.results,
		outcomes: outcomes.results,
		summary: {
			totalIncome,
			totalExpenses,
			netProfit: totalIncome - totalExpenses,
			totalCredit,
			platformBreakdown,
		},
	};
}

export async function updateReport(
	db: D1Database,
	reportId: string,
	data: {
		endingMileage?: number;
		endingGasoline?: number;
		notes?: string;
	},
): Promise<DailyReport> {
	const report = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!report) {
		throw new Error('Report not found');
	}

	if (report.status === 'cerrado') {
		throw new Error('Cannot update a closed report');
	}

	// Validate ending values if provided
	if (data.endingMileage !== undefined && report.starting_mileage !== null) {
		if (data.endingMileage < report.starting_mileage) {
			throw new Error('Ending mileage cannot be less than starting mileage');
		}
	}

	if (data.endingGasoline !== undefined && report.starting_gasoline !== null) {
		if (data.endingGasoline > report.starting_gasoline) {
			throw new Error(
				'Ending gasoline cannot be greater than starting gasoline',
			);
		}
	}

	const now = Math.floor(Date.now() / 1000);
	const updates: string[] = [];
	const values: any[] = [];

	if (data.endingMileage !== undefined) {
		updates.push('ending_mileage = ?');
		values.push(data.endingMileage);
	}

	if (data.endingGasoline !== undefined) {
		updates.push('ending_gasoline = ?');
		values.push(data.endingGasoline);
	}

	if (data.notes !== undefined) {
		updates.push('notes = ?');
		values.push(data.notes);
	}

	updates.push('updated_at = ?');
	values.push(now);
	values.push(reportId);

	await db
		.prepare(`UPDATE daily_reports SET ${updates.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();

	const updated = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!updated) {
		throw new Error('Failed to update report');
	}

	return updated;
}

export async function closeDay(
	db: D1Database,
	reportId: string,
	endingMileage: number,
	endingGasoline: number,
	notes?: string,
): Promise<DailyReport> {
	const report = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!report) {
		throw new Error('Report not found');
	}

	if (report.status === 'cerrado') {
		throw new Error('Report is already closed');
	}

	if (report.starting_mileage === null) {
		throw new Error('Starting mileage is not set');
	}

	if (report.starting_gasoline === null) {
		throw new Error('Starting gasoline is not set');
	}

	// Validate ending values
	if (endingMileage < report.starting_mileage) {
		throw new Error('Ending mileage cannot be less than starting mileage');
	}

	if (endingGasoline > report.starting_gasoline) {
		throw new Error('Ending gasoline cannot be greater than starting gasoline');
	}

	const distanceDriven = endingMileage - report.starting_mileage;
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`UPDATE daily_reports 
       SET ending_mileage = ?, ending_gasoline = ?, distance_driven = ?, notes = ?, 
           status = 'cerrado', submitted_at = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(
			endingMileage,
			endingGasoline,
			distanceDriven,
			notes || null,
			now,
			now,
			reportId,
		)
		.run();

	const closed = await db
		.prepare('SELECT * FROM daily_reports WHERE id = ?')
		.bind(reportId)
		.first<DailyReport>();

	if (!closed) {
		throw new Error('Failed to close report');
	}

	return closed;
}
