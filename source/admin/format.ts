export function truncate(text: string, max: number): string {
	const flat = text.replaceAll(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `2026-09-20T11:00:00.000Z` → `2026-09-20 11:00` (UTC, sin ambigüedad de zona). */
export function formatTimestamp(iso: string): string {
	return iso.replace('T', ' ').slice(0, 16);
}

export function formatUsd(value: number): string {
	return `$${value.toFixed(2)}`;
}

export function secondsUntil(iso: string | null, now = Date.now()): number {
	if (!iso) return 0;
	return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}
