import {useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';
import {parseBudgetArgs} from '../admin/args.js';
import {Confirm} from '../admin/Confirm.js';
import {formatTimestamp, formatUsd} from '../admin/format.js';
import {describeError, unwrap, useLoad} from '../admin/load.js';
import {useInteractive} from '../admin/useInteractive.js';
import type {components} from '../api-types.js';

interface BudgetViewProps {
	readonly args: readonly string[];
	/** `--yes`: salta la confirmación (scripts sin TTY). */
	readonly isConfirmed?: boolean;
}

type Phase =
	| {readonly name: 'idle'}
	| {readonly name: 'busy'}
	| {readonly name: 'done'}
	| {readonly name: 'message'; readonly text: string; readonly ok: boolean};

const USAGE = 'Uso: jin budget · jin budget unpause [--yes]';

async function fetchBudget() {
	const client = createApiClient();
	return unwrap(await client.GET('/api/budget'), 'consultar el presupuesto');
}

async function unpause(): Promise<void> {
	const client = createApiClient();
	unwrap(await client.POST('/api/budget/unpause'), 'reactivar el agente');
}

function Bar({ratio}: {readonly ratio: number}) {
	const width = 20;
	const filled = Math.min(width, Math.round(Math.max(0, ratio) * width));
	let color = 'green';
	if (ratio >= 1) color = 'red';
	else if (ratio >= 0.8) color = 'yellow';
	return (
		<Text color={color}>
			{'█'.repeat(filled)}
			{'░'.repeat(width - filled)} {Math.round(ratio * 100)}%
		</Text>
	);
}

type Budget = components['schemas']['BudgetStatusDto_Output'];

function BudgetSummary({budget: b}: {readonly budget: Budget}) {
	const ks = b.killSwitch;
	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor={b.killSwitchActive ? 'red' : 'cyan'}
		>
			<Text bold>💰 Presupuesto diario</Text>
			<Bar ratio={b.dailyUsageRatio} />
			<Text>
				Gasto: {formatUsd(b.dailyUsageUsd)} / {formatUsd(b.dailyLimitUsd)} ·
				Tokens: {b.dailyUsageTokens} / {b.dailyLimitTokens}
			</Text>
			<Text color={b.killSwitchActive ? 'red' : 'green'} bold>
				{b.killSwitchActive
					? '🛑 KILL SWITCH ACTIVO — el agente está pausado'
					: '🟢 Kill switch inactivo'}
			</Text>
			{b.killSwitchActive && (
				<Text color="gray">
					Desde {ks.activatedAt ? formatTimestamp(ks.activatedAt) : '—'} ·
					Motivo: {ks.reason ?? '—'} · Tokens esta hora: {ks.currentHourTokens}{' '}
					(promedio {Math.round(ks.avgHourlyTokens)})
				</Text>
			)}
		</Box>
	);
}

export function BudgetView({args, isConfirmed = false}: BudgetViewProps) {
	const [command] = useState(() => parseBudgetArgs(args));
	const interactive = useInteractive();
	const [reloadKey, setReloadKey] = useState(0);
	const [phase, setPhase] = useState<Phase>({name: 'idle'});
	const started = useRef(false);
	const loaded = useLoad(fetchBudget, reloadKey);

	const run = () => {
		setPhase({name: 'busy'});
		unpause()
			.then(() => {
				setPhase({name: 'done'});
				setReloadKey(key => key + 1);
			})
			.catch((error: unknown) => {
				setPhase({name: 'message', text: describeError(error), ok: false});
			});
	};

	const canRun =
		command.kind === 'unpause' &&
		loaded.status === 'ok' &&
		loaded.data.killSwitchActive;

	useEffect(() => {
		// `--yes`: se ejecuta una sola vez, sin pedir confirmación.
		if (isConfirmed && canRun && !started.current) {
			started.current = true;
			run();
		}
	}, [isConfirmed, canRun]);

	if (command.kind === 'invalid') {
		return (
			<Box padding={1}>
				<Text color="red">❌ {USAGE}</Text>
			</Box>
		);
	}

	if (loaded.status === 'loading') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Consultando el presupuesto...</Text>
			</Box>
		);
	}

	if (loaded.status === 'error') {
		return (
			<Box padding={1}>
				<Text color="red">❌ {loaded.message}</Text>
			</Box>
		);
	}

	const b = loaded.data;
	const summary = <BudgetSummary budget={b} />;

	if (command.kind === 'status') return summary;

	// ---- `jin budget unpause` ----
	if (phase.name === 'done') {
		return (
			<Box flexDirection="column">
				<Text color="green" bold>
					✅ Agente reactivado.
				</Text>
				{summary}
			</Box>
		);
	}

	if (phase.name === 'message') {
		return (
			<Box padding={1}>
				<Text color={phase.ok ? 'green' : 'red'}>
					{phase.ok ? '' : '❌ '}
					{phase.text}
				</Text>
			</Box>
		);
	}

	if (phase.name === 'busy') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Reactivando el agente...</Text>
			</Box>
		);
	}

	if (!b.killSwitchActive) {
		return (
			<Box flexDirection="column">
				{summary}
				<Text color="gray">
					El kill switch no está activo: no hay nada que reactivar.
				</Text>
			</Box>
		);
	}

	if (isConfirmed) return summary; // El efecto ya está ejecutando

	if (!interactive) {
		return (
			<Box flexDirection="column">
				{summary}
				<Text color="yellow">
					Sin terminal interactiva: repite con `jin budget unpause --yes` para
					confirmar.
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{summary}
			<Confirm
				question="¿Reactivar el agente? Se limpia el kill switch; revisa antes por qué saltó."
				confirmLabel="Sí, reactivar"
				onCancel={() => {
					setPhase({
						name: 'message',
						text: 'Cancelado: el agente sigue pausado.',
						ok: true,
					});
				}}
				onConfirm={run}
			/>
		</Box>
	);
}
