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
};

// Add this to support c.set('user', ...) in middleware
export type Variables = {
	user: AuthContext;
	report?: DailyReport;
};
