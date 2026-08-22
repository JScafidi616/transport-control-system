/**
 * Get today's date in Costa Rica timezone (UTC-6, no DST)
 * Format: YYYY-MM-DD
 */
export function getCostaRicaToday(): string {
	const now = new Date();
	const costaRicaTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
	return costaRicaTime.toISOString().split('T')[0];
}
