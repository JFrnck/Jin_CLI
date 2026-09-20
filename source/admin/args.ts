export type BudgetCommand =
	| {readonly kind: 'status'}
	| {readonly kind: 'unpause'}
	| {readonly kind: 'invalid'};

export function parseBudgetArgs(args: readonly string[]): BudgetCommand {
	if (args.length === 0) return {kind: 'status'};
	if (args.length === 1 && args[0]?.toLowerCase() === 'unpause') {
		return {kind: 'unpause'};
	}

	return {kind: 'invalid'};
}

export const AUDIT_DEFAULT_LIMIT = 20;
export const AUDIT_MAX_LIMIT = 200;

export type AuditCommand =
	| {readonly kind: 'list'; readonly limit: number}
	| {readonly kind: 'invalid'};

export function parseAuditArgs(args: readonly string[]): AuditCommand {
	if (args.length === 0) return {kind: 'list', limit: AUDIT_DEFAULT_LIMIT};
	if (args.length > 1 || !/^\d+$/.test(args[0] ?? '')) {
		return {kind: 'invalid'};
	}

	const limit = Number(args[0]);
	return limit >= 1 && limit <= AUDIT_MAX_LIMIT
		? {kind: 'list', limit}
		: {kind: 'invalid'};
}

export type PreviewsCommand =
	| {readonly kind: 'list'}
	| {readonly kind: 'stop'; readonly serviceId?: string}
	| {readonly kind: 'invalid'};

export function parsePreviewsArgs(args: readonly string[]): PreviewsCommand {
	if (args.length === 0) return {kind: 'list'};
	if (args[0]?.toLowerCase() === 'stop' && args.length <= 2) {
		return args[1] === undefined
			? {kind: 'stop'}
			: {kind: 'stop', serviceId: args[1]};
	}

	return {kind: 'invalid'};
}

export type RunsCommand =
	| {readonly kind: 'list'}
	| {readonly kind: 'detail'; readonly runId: string}
	| {readonly kind: 'invalid'};

export function parseRunsArgs(args: readonly string[]): RunsCommand {
	if (args.length === 0) return {kind: 'list'};
	if (args.length === 1 && args[0]) return {kind: 'detail', runId: args[0]};
	return {kind: 'invalid'};
}
