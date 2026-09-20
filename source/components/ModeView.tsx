import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';
import {MODE_LABEL, parseModeArgs, type AutonomyMode} from '../mode-args.js';

interface ModeViewProps {
	readonly args: readonly string[];
}

type Outcome =
	| {
			readonly type: 'status';
			readonly mode: AutonomyMode;
			readonly remainingSeconds: number | undefined;
			readonly guarded: readonly string[];
			readonly breaker: number;
	  }
	| {readonly type: 'applied'; readonly mode: AutonomyMode}
	| {
			readonly type: 'pending';
			readonly mode: AutonomyMode;
			readonly hours: number;
			readonly requestId: string;
	  }
	| {readonly type: 'error'; readonly message: string};

function formatRemaining(seconds: number | undefined): string {
	if (seconds === undefined) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

const USAGE =
	'Uso: jin mode · jin mode safe · jin mode semi [horas] · jin mode auto [horas]';

const UNAUTHENTICATED =
	'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.';

async function loadStatus(): Promise<Outcome> {
	const client = createApiClient();
	const {data, error, response} = await client.GET('/api/autonomy');
	if (error || !data) {
		const {status} = response as Response;
		return {
			type: 'error',
			message:
				status === 401
					? UNAUTHENTICATED
					: `Error al consultar el modo (HTTP ${status}).`,
		};
	}

	return {
		type: 'status',
		mode: data.mode,
		remainingSeconds: data.remainingSeconds ?? undefined,
		guarded: data.guardedInSemiAuto,
		breaker: data.limits.maxRelaxedActionsPerHour,
	};
}

async function requestChange(
	mode: AutonomyMode,
	hours: number | undefined,
): Promise<Outcome> {
	const client = createApiClient();
	const {data, error, response} = await client.POST('/api/autonomy', {
		body: {mode, ...(hours === undefined ? {} : {hours})},
	});
	if (error || !data) {
		const {status} = response as Response;
		return {
			type: 'error',
			message:
				status === 401
					? UNAUTHENTICATED
					: `Error al cambiar el modo (HTTP ${status}).`,
		};
	}

	return data.status === 'applied'
		? {type: 'applied', mode: data.mode}
		: {
				type: 'pending',
				mode: data.mode,
				hours: data.hours,
				requestId: data.requestId,
		  };
}

export function ModeView({args}: ModeViewProps) {
	const [command] = useState(() => parseModeArgs(args));
	const [outcome, setOutcome] = useState<Outcome | undefined>(
		command.kind === 'invalid' ? {type: 'error', message: USAGE} : undefined,
	);

	useEffect(() => {
		if (command.kind === 'invalid') return;

		const task =
			command.kind === 'status'
				? loadStatus()
				: requestChange(command.mode, command.hours);
		task.then(setOutcome).catch((error_: unknown) => {
			const message = error_ instanceof Error ? error_.message : String(error_);
			setOutcome({
				type: 'error',
				message: `Error de comunicación con Jin Core: ${message}`,
			});
		});
	}, [command]);

	if (!outcome) {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Consultando el modo de autonomía...</Text>
			</Box>
		);
	}

	if (outcome.type === 'error') {
		return (
			<Box padding={1}>
				<Text color="red">❌ {outcome.message}</Text>
			</Box>
		);
	}

	if (outcome.type === 'applied') {
		return (
			<Box padding={1} borderStyle="round" borderColor="green">
				<Text color="green">
					✅ Modo «{MODE_LABEL[outcome.mode]}» aplicado.
				</Text>
			</Box>
		);
	}

	if (outcome.type === 'pending') {
		return (
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="round"
				borderColor="yellow"
			>
				<Text color="yellow" bold>
					⏳ Falta tu DOBLE aprobación para pasar a «{MODE_LABEL[outcome.mode]}»
					durante {outcome.hours} h
				</Text>
				<Text>Bajar la protección del HITL exige 2 aprobaciones ≥30 s.</Text>
				<Text>
					1) <Text color="green">jin approve {outcome.requestId}</Text>
				</Text>
				<Text>
					2) esperá 30 s y repetí{' '}
					<Text color="green">jin approve {outcome.requestId}</Text>
				</Text>
				<Text color="gray">
					Mientras tanto sigue el modo actual. Para cancelar: jin reject{' '}
					{outcome.requestId}
				</Text>
			</Box>
		);
	}

	const relaxed = outcome.mode !== 'supervised';
	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor={relaxed ? 'yellow' : 'green'}
		>
			<Text bold>
				{relaxed ? '🟠' : '🟢'} Modo: {MODE_LABEL[outcome.mode]}
				{relaxed
					? ` — vuelve solo a supervisado en ${formatRemaining(
							outcome.remainingSeconds,
					  )}`
					: ' (HITL completo)'}
			</Text>
			{outcome.mode === 'semi-auto' && (
				<Text color="gray">
					Siguen pidiendo aprobación: {outcome.guarded.join(', ')}
				</Text>
			)}
			{relaxed && (
				<Text color="gray">
					Freno de emergencia: más de {outcome.breaker} acciones autoejecutadas
					en 1 h lo devuelve a supervisado. Volver ya: jin mode safe
				</Text>
			)}
		</Box>
	);
}
