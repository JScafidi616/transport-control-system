import type { D1Database } from '@cloudflare/workers-types';
import { hashPassword, comparePassword } from '../utils/password';

export async function checkAllowlist(
	db: D1Database,
	email: string,
): Promise<boolean> {
	const result = await db
		.prepare('SELECT 1 FROM allowed_emails WHERE email = ?')
		.bind(email.toLowerCase())
		.first();
	return result !== null;
}

export async function registerUser(
	db: D1Database,
	email: string,
	password: string,
	fullName: string,
) {
	const isAllowed = await checkAllowlist(db, email);
	if (!isAllowed) {
		throw new Error('Email is not on the allowed list.');
	}

	const existingUser = await db
		.prepare('SELECT id FROM users WHERE email = ?')
		.bind(email.toLowerCase())
		.first();

	if (existingUser) {
		throw new Error('Email already registered.');
	}

	const hashedPassword = await hashPassword(password);
	const userId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`
    INSERT INTO users (id, email, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'driver', 'pending', ?, ?)
  `,
		)
		.bind(userId, email.toLowerCase(), hashedPassword, fullName, now, now)
		.run();

	return { id: userId, email, fullName, status: 'pending' as const };
}

export async function loginUser(
	db: D1Database,
	email: string,
	password: string,
) {
	const user = await db
		.prepare(
			`
    SELECT id, email, password_hash, full_name, role, status 
    FROM users WHERE email = ?
  `,
		)
		.bind(email.toLowerCase())
		.first<any>();

	if (!user) {
		throw new Error('Invalid email or password.');
	}

	if (user.status !== 'approved') {
		throw new Error(
			`Account is ${user.status}. Please wait for admin approval.`,
		);
	}

	const isValid = await comparePassword(password, user.password_hash);
	if (!isValid) {
		throw new Error('Invalid email or password.');
	}

	return {
		id: user.id,
		email: user.email,
		fullName: user.full_name,
		role: user.role as 'driver' | 'admin',
	};
}

export async function loginOrRegisterWithGoogle(
	db: D1Database,
	googleUserId: string,
	email: string,
	fullName: string,
) {
	// Check if user exists by email
	const existingUser = await db
		.prepare(
			`
    SELECT id, email, google_id, full_name, role, status 
    FROM users WHERE email = ?
  `,
		)
		.bind(email)
		.first<any>();

	if (existingUser) {
		// User exists - check if we need to link accounts
		if (!existingUser.google_id) {
			// Link Google account to existing user
			await db
				.prepare(
					`
        UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?
      `,
				)
				.bind(googleUserId, Math.floor(Date.now() / 1000), existingUser.id)
				.run();
		} else if (existingUser.google_id !== googleUserId) {
			// Google ID mismatch - security issue
			throw new Error('Google account already linked to a different user.');
		}

		// Check if account is approved
		if (existingUser.status !== 'approved') {
			throw new Error(
				`Account is ${existingUser.status}. Please wait for admin approval.`,
			);
		}

		return {
			id: existingUser.id,
			email: existingUser.email,
			fullName: existingUser.full_name,
			role: existingUser.role as 'driver' | 'admin',
			isNewUser: false,
		};
	}

	// User doesn't exist - check allowlist
	const isAllowed = await checkAllowlist(db, email);
	if (!isAllowed) {
		throw new Error('Email is not on the allowed list.');
	}

	// Create new user with pending status
	const userId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`
    INSERT INTO users (id, email, google_id, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'driver', 'pending', ?, ?)
  `,
		)
		.bind(userId, email, googleUserId, fullName, now, now)
		.run();

	return {
		id: userId,
		email,
		fullName,
		role: 'driver' as const,
		isNewUser: true,
	};
}
