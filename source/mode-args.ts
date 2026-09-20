export type AutonomyMode = 'supervised' | 'semi-auto' | 'auto';

export type ModeCommand =
	| {readonly kind: 'status'}
	| {
			readonly kind: 'change';
			readonly mode: AutonomyMode;
			readonly hours?: number;
	  }
	| {readonly kind: 'invalid'};

const MODE_ALIASES: Readonly<Record<string, AutonomyMode>> = {
	safe: 'supervised',
	seguro: 'supervised',
	supervised: 'supervised',
	supervisado: 'supervised',
	hitl: 'supervised',
	semi: 'semi-auto',
	semiauto: 'semi-auto',
	'semi-auto': 'semi-auto',
	semiautomatico: 'semi-auto',
	semiautomático: 'semi-auto',
	auto: 'auto',
	automatico: 'auto',
	automático: 'auto',
};

/**
 * Parsea los argumentos de `jin mode` (mismo contrato que `/mode` de Telegram):
 *   jin mode            -> estado
 *   jin mode safe       -> supervised
 *   jin mode semi [h]   -> semi-auto durante h horas (default del servidor)
 *   jin mode auto [h]   -> auto durante h horas
 * Entrada inválida -> `invalid`, nunca un cambio adivinado.
 */
export function parseModeArgs(args: readonly string[]): ModeCommand {
	if (args.length === 0) return {kind: 'status'};
	if (args.length > 2) return {kind: 'invalid'};

	const mode = MODE_ALIASES[(args[0] ?? '').toLowerCase()];
	if (mode === undefined) return {kind: 'invalid'};
	if (args.length === 1) return {kind: 'change', mode};

	const hours = Number(args[1]);
	if (!Number.isInteger(hours) || hours <= 0) return {kind: 'invalid'};
	return {kind: 'change', mode, hours};
}

export const MODE_LABEL: Readonly<Record<AutonomyMode, string>> = {
	supervised: 'Supervisado',
	'semi-auto': 'Semiautomático',
	auto: 'Automático',
};
