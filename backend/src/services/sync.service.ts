import type { D1Database } from '@cloudflare/workers-types';
import type {
	DailyReport,
	SyncableEntity,
	SyncChanges,
	SyncConflict,
	Ride,
	Client,
	CreditPayment,
	Expenses,
} from '../types';

export async function syncData(
	db: D1Database,
	userId: string,
	lastSyncAt: number | undefined,
	clientChanges: SyncChanges,
): Promise<{
	serverChanges: SyncChanges;
	conflicts: SyncConflict[];
	errors: Array<{ entity_type: string; entity_id: string; error: string }>;
	newSyncTimestamp: number;
}> {
	const conflicts: SyncConflict[] = [];
	const errors: Array<{
		entity_type: string;
		entity_id: string;
		error: string;
	}> = [];
	const now = Math.floor(Date.now() / 1000);

	// Procesar cada tipo de entidad
	if (clientChanges.daily_reports) {
		await syncEntities(
			db,
			userId,
			'daily_reports',
			clientChanges.daily_reports,
			conflicts,
			errors,
		);
	}

	if (clientChanges.rides) {
		await syncEntities(
			db,
			userId,
			'rides',
			clientChanges.rides,
			conflicts,
			errors,
		);
	}

	if (clientChanges.expenses) {
		await syncEntities(
			db,
			userId,
			'outcomes',
			clientChanges.expenses,
			conflicts,
			errors,
		);
	}

	if (clientChanges.clients) {
		await syncEntities(
			db,
			userId,
			'clients',
			clientChanges.clients,
			conflicts,
			errors,
		);
	}

	if (clientChanges.credit_payments) {
		await syncEntities(
			db,
			userId,
			'credit_payments',
			clientChanges.credit_payments,
			conflicts,
			errors,
		);
	}

	// Obtener cambios del servidor desde last_sync_at
	const serverChanges = await getServerChanges(db, userId, lastSyncAt || 0);

	return {
		serverChanges,
		conflicts,
		errors,
		newSyncTimestamp: now,
	};
}

async function syncEntities(
	db: D1Database,
	userId: string,
	entityType: string,
	entities: SyncableEntity[],
	conflicts: SyncConflict[],
	errors: Array<{ entity_type: string; entity_id: string; error: string }>,
) {
	for (const entity of entities) {
		try {
			// Verificar ownership (excepto para clients que pueden ser compartidos)
			if (entityType !== 'clients') {
				const ownershipCheck = await checkOwnership(
					db,
					userId,
					entityType,
					entity.id,
				);
				if (!ownershipCheck) {
					errors.push({
						entity_type: entityType,
						entity_id: entity.id,
						error: 'No tienes permiso para modificar esta entidad',
					});
					continue;
				}
			}

			// Obtener versión del servidor
			const serverEntity = await db
				.prepare(`SELECT * FROM ${entityType} WHERE id = ?`)
				.bind(entity.id)
				.first<SyncableEntity>();

			if (!serverEntity) {
				// Entidad no existe en servidor - insertar
				await insertEntity(db, entityType, entity);
			} else {
				// Entidad existe - comparar timestamps
				if (serverEntity.deleted_at) {
					// Servidor tiene soft delete - server wins
					conflicts.push({
						entity_type: entityType,
						entity_id: entity.id,
						server_version: serverEntity,
						client_version: entity,
					});
				} else if (entity.deleted_at) {
					// Cliente quiere eliminar - soft delete
					await softDeleteEntity(db, entityType, entity.id);
				} else if (entity.updated_at > serverEntity.updated_at) {
					// Cliente tiene versión más nueva - conflicto, server wins
					conflicts.push({
						entity_type: entityType,
						entity_id: entity.id,
						server_version: serverEntity,
						client_version: entity,
					});
				} else if (entity.updated_at < serverEntity.updated_at) {
					// Servidor tiene versión más nueva - actualizar cliente (no hacer nada en servidor)
					// El cliente recibirá la versión del servidor en serverChanges
				}
				// Si son iguales, no hacer nada
			}
		} catch (error) {
			errors.push({
				entity_type: entityType,
				entity_id: entity.id,
				error: error instanceof Error ? error.message : 'Error desconocido',
			});
		}
	}
}

async function checkOwnership(
	db: D1Database,
	userId: string,
	entityType: string,
	entityId: string,
): Promise<boolean> {
	let query = '';

	switch (entityType) {
		case 'daily_reports':
			query = 'SELECT driver_id FROM daily_reports WHERE id = ?';
			break;
		case 'rides':
			query =
				'SELECT dr.driver_id FROM rides r JOIN daily_reports dr ON r.daily_report_id = dr.id WHERE r.id = ?';
			break;
		case 'outcomes':
			query =
				'SELECT dr.driver_id FROM outcomes o JOIN daily_reports dr ON o.daily_report_id = dr.id WHERE o.id = ?';
			break;
		case 'credit_payments':
			query =
				'SELECT c.driver_id FROM credit_payments cp JOIN clients c ON cp.client_id = c.id WHERE cp.id = ?';
			break;
		default:
			return false;
	}

	const result = await db
		.prepare(query)
		.bind(entityId)
		.first<{ driver_id: string }>();
	return result?.driver_id === userId;
}
//TODO check if the function should remain dinamic or if it should be refactored to be more specific for each entity type.
async function insertEntity(db: D1Database, entityType: string, entity: any) {
	const columns = Object.keys(entity).filter(
		(k) => k !== 'deleted_at' || entity[k] !== null,
	);
	const values = columns.map((k) => entity[k]);
	const placeholders = columns.map(() => '?').join(', ');

	await db
		.prepare(
			`INSERT INTO ${entityType} (${columns.join(', ')}) VALUES (${placeholders})`,
		)
		.bind(...values)
		.run();
}

async function softDeleteEntity(
	db: D1Database,
	entityType: string,
	entityId: string,
) {
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`UPDATE ${entityType} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
		)
		.bind(now, now, entityId)
		.run();
}

async function getServerChanges(
	db: D1Database,
	userId: string,
	sinceTimestamp: number,
): Promise<SyncChanges> {
	const changes: SyncChanges = {};

	// Daily reports
	const reports = await db
		.prepare(
			`
      SELECT * FROM daily_reports 
      WHERE driver_id = ? AND updated_at > ? 
      ORDER BY updated_at ASC
    `,
		)
		.bind(userId, sinceTimestamp)
		.all<DailyReport>();
	if (reports.results.length > 0) {
		changes.daily_reports = reports.results;
	}

	// Rides
	const rides = await db
		.prepare(
			`
      SELECT r.* FROM rides r
      JOIN daily_reports dr ON r.daily_report_id = dr.id
      WHERE dr.driver_id = ? AND r.updated_at > ?
      ORDER BY r.updated_at ASC
    `,
		)
		.bind(userId, sinceTimestamp)
		.all<Ride>();
	if (rides.results.length > 0) {
		changes.rides = rides.results;
	}

	// Expenses (outcomes)
	const expenses = await db
		.prepare(
			`
      SELECT o.* FROM outcomes o
      JOIN daily_reports dr ON o.daily_report_id = dr.id
      WHERE dr.driver_id = ? AND o.updated_at > ?
      ORDER BY o.updated_at ASC
    `,
		)
		.bind(userId, sinceTimestamp)
		.all<Expenses>();
	if (expenses.results.length > 0) {
		changes.expenses = expenses.results;
	}

	// Clients
	const clients = await db
		.prepare(
			`
      SELECT * FROM clients 
      WHERE driver_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `,
		)
		.bind(userId, sinceTimestamp)
		.all<Client>();
	if (clients.results.length > 0) {
		changes.clients = clients.results;
	}

	// Credit payments
	const payments = await db
		.prepare(
			`
      SELECT cp.* FROM credit_payments cp
      JOIN clients c ON cp.client_id = c.id
      WHERE c.driver_id = ? AND cp.updated_at > ?
      ORDER BY cp.updated_at ASC
    `,
		)
		.bind(userId, sinceTimestamp)
		.all<CreditPayment>();
	if (payments.results.length > 0) {
		changes.credit_payments = payments.results;
	}

	return changes;
}
