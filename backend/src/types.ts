/**
 * Cloudflare Worker environment bindings
 * These are injected by Wrangler based on wrangler.toml and secrets
 */
export type Env = {
	DB: D1Database;
	JWT_SECRET: string;
	GOOGLE_CLIENT_ID_MOBILE: string;
	GOOGLE_CLIENT_ID_WEB: string;
};

/**
 * Standard API error response
 */
export type ApiError = {
	success: false;
	error: string;
	code?: string;
};

/**
 * Standard API success response
 */
export type ApiResponse<T = unknown> = {
	success: true;
	data: T;
};

/**
 * User role enum
 */
export type UserRole = 'driver' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'rejected';

/**
 * Authenticated user context (attached to request by auth middleware)
 */
export type AuthContext = {
	userId: string;
	email: string;
	role: UserRole;
};

/**
 * Daily report type
 */
export type DailyReport = {
	id: string;
	driver_id: string;
	report_date: string;
	starting_mileage: number | null;
	ending_mileage: number | null;
	distance_driven: number | null;
	starting_gasoline: number | null;
	ending_gasoline: number | null;
	notes: string | null;
	status: 'borrador' | 'cerrado';
	submitted_at: number | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

/**
 * Ride type
 */
export type Ride = {
	id: string;
	daily_report_id: string;
	amount: number;
	platform: string;
	payment_method: string;
	client_id: string | null;
	is_late_addition: number;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

/**
 * Expenses type
 */
export type Expenses = {
	id: string;
	daily_report_id: string;
	category: string;
	amount: number;
	description: string;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

/**
 * Client type
 */
export type Client = {
	id: string;
	driver_id: string;
	full_name: string;
	phone: number | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

/**
 * CreditPayment type
 */
export type CreditPayment = {
	id: string;
	client_id: string | null;
	amount: number;
	payment_date: string;
	notes: string | null;
	created_at: number;
	updated_at: number; //TODO add updated_at to the database table
	deleted_at: number | null; //TODO same as above
};

// Add this to support c.set('user', ...) in middleware
export type Variables = {
	user: AuthContext;
	report?: DailyReport;
};

/**
 * Syncable entity type
 */
export type SyncableEntity = {
	id: string;
	updated_at: number;
	deleted_at?: number | null;
};

/**
 * Sync changes type
 */
export type SyncChanges = {
	daily_reports?: DailyReport[];
	rides?: Ride[];
	expenses?: Expenses[];
	clients?: Client[];
	credit_payments?: CreditPayment[];
};

/**
 * Sync conflict type
 */
export type SyncConflict = {
	entity_type: string;
	entity_id: string;
	server_version: SyncableEntity;
	client_version: SyncableEntity;
};
