import {useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {createApiClient} from '../api/client.js';
import {Confirm} from '../admin/Confirm.js';
import {secondsUntil, truncate} from '../admin/format.js';
import {unwrap, useLoad} from '../admin/load.js';
import {useInteractive} from '../admin/useInteractive.js';
import {
	resolveApproval,
	type ApprovalAction,
	type ApprovalOutcome,
} from '../hitl-actions.js';
import type {components} from '../api-types.js';

type Pending = components['schemas']['PendingApprovalDto'];

type Step =
	| {readonly name: 'list'}
	| {readonly name: 'detail'; readonly id: string}
	| {
			readonly name: 'confirm';
			readonly id: string;
			readonly action: ApprovalAction;
	  }
	| {readonly name: 'busy'; readonly action: ApprovalAction}
	| {readonly name: 'result'; readonly outcome: ApprovalOutcome};

async function fetchPending(): Promise<Pending[]> {
	const client = createApiClient();
	return unwrap(
		await client.GET('/api/hitl/pending'),
		'obtener aprobaciones pendientes',
	);
}

function label(item: Pending): string {
	const stage = item.firstApprovedAt ? ' (1/2 aprobada)' : '';
	const what = item.planSummary
		? truncate(item.planSummary, 60)
		: item.requestId.slice(0, 8);
	return `[${item.level}] ${item.toolName}${stage} — ${what}`;
}

function Detail({item}: {readonly item: Pending}) {
	const wait = secondsUntil(item.availableAt);
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold>
				[{item.level.toUpperCase()}] <Text color="cyan">{item.toolName}</Text>
			</Text>
			<Text color="gray">ID: {item.requestId}</Text>
			{item.planSummary && <Text>Plan: {item.planSummary}</Text>}
			{item.actor && <Text color="gray">Solicitado por: {item.actor}</Text>}
			{item.externalInputsSummary && (
				<Text color="gray">Inputs externos: {item.externalInputsSummary}</Text>
			)}
			{item.firstApprovedAt && (
				<Text color="yellow">
					1ª aprobación registrada por {item.firstApprover ?? '—'}.
					{wait > 0
						? ` La 2ª estará disponible en ${wait} s.`
						: ' Ya puedes dar la 2ª aprobación.'}
				</Text>
			)}
			{item.executionError && (
				<Text color="red">
					⚠ La última aprobación NO se ejecutó: {item.executionError}. No se
					reintenta sola.
				</Text>
			)}
		</Box>
	);
}

export function InboxView() {
	const interactive = useInteractive();
	const {exit} = useApp();
	const [reloadKey, setReloadKey] = useState(0);
	const [step, setStep] = useState<Step>({name: 'list'});
	const loaded = useLoad(fetchPending, reloadKey);

	useInput(
		(input, key) => {
			if (input === 'q' || key.escape) exit();
		},
		{isActive: interactive && step.name === 'list'},
	);

	if (loaded.status === 'loading') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Cargando la bandeja de aprobaciones...</Text>
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

	const items = loaded.data;

	if (items.length === 0) {
		return (
			<Box padding={1} borderStyle="round" borderColor="green">
				<Text color="green" bold>
					🎉 No hay aprobaciones pendientes.
				</Text>
			</Box>
		);
	}

	if (!interactive) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow" bold>
					📋 Aprobaciones pendientes ({items.length})
				</Text>
				{items.map(item => (
					<Text key={item.requestId}>
						{item.requestId} {label(item)}
					</Text>
				))}
				<Text color="gray">
					Sin terminal interactiva: usa `jin approve &lt;id&gt;` o `jin reject
					&lt;id&gt;`.
				</Text>
			</Box>
		);
	}

	const back = () => {
		setStep({name: 'list'});
		setReloadKey(key => key + 1);
	};

	if (step.name === 'busy') {
		return (
			<Box padding={1}>
				<Text color="yellow">
					⏳ {step.action === 'approve' ? 'Aprobando' : 'Rechazando'}...
				</Text>
			</Box>
		);
	}

	if (step.name === 'result') {
		const {outcome} = step;
		const good = ['resolved', 'rejected'].includes(outcome.type);
		return (
			<Box flexDirection="column" padding={1}>
				<Text color={good ? 'green' : 'yellow'} bold>
					{outcome.message}
				</Text>
				{outcome.detail && <Text color="gray">{outcome.detail}</Text>}
				<SelectInput
					key="result"
					items={[{label: 'Volver a la bandeja', value: 'back'}]}
					onSelect={back}
				/>
			</Box>
		);
	}

	if (step.name === 'detail' || step.name === 'confirm') {
		const item = items.find(entry => entry.requestId === step.id);
		if (!item) {
			// Se resolvió desde otra superficie (Web/Telegram) mientras mirábamos.
			return (
				<Box flexDirection="column" padding={1}>
					<Text color="yellow">
						⚠️ Esa aprobación ya no está pendiente (se resolvió desde otra
						superficie).
					</Text>
					<SelectInput
						key="gone"
						items={[{label: 'Volver a la bandeja', value: 'back'}]}
						onSelect={back}
					/>
				</Box>
			);
		}

		if (step.name === 'confirm') {
			const {action} = step;
			return (
				<Box flexDirection="column" padding={1}>
					<Detail item={item} />
					<Confirm
						key={`confirm-${action}-${item.requestId}`}
						question={
							action === 'approve'
								? `¿Aprobar y EJECUTAR ${item.toolName}?`
								: `¿Rechazar ${item.toolName}?`
						}
						confirmLabel={action === 'approve' ? 'Sí, aprobar' : 'Sí, rechazar'}
						onCancel={() => {
							setStep({name: 'detail', id: item.requestId});
						}}
						onConfirm={() => {
							setStep({name: 'busy', action});
							resolveApproval(action, item.requestId)
								.then(outcome => {
									setStep({name: 'result', outcome});
								})
								.catch(() => {
									setStep({
										name: 'result',
										outcome: {type: 'error', message: 'Error inesperado.'},
									});
								});
						}}
					/>
				</Box>
			);
		}

		return (
			<Box flexDirection="column" padding={1}>
				<Detail item={item} />
				{/* «Volver» va primero: es la opción resaltada por defecto. */}
				<SelectInput
					key={`detail-${item.requestId}`}
					items={[
						{label: 'Volver', value: 'back'},
						{label: 'Aprobar', value: 'approve'},
						{label: 'Rechazar', value: 'reject'},
					]}
					onSelect={choice => {
						if (choice.value === 'back') {
							setStep({name: 'list'});
						} else {
							setStep({
								name: 'confirm',
								id: item.requestId,
								action: choice.value as ApprovalAction,
							});
						}
					}}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text color="yellow" bold>
				📋 Aprobaciones pendientes ({items.length}) — ↑↓ navegar · Enter abrir ·
				q salir
			</Text>
			<SelectInput
				key="list"
				items={items.map(item => ({
					label: label(item),
					value: item.requestId,
				}))}
				onSelect={choice => {
					setStep({name: 'detail', id: choice.value});
				}}
			/>
		</Box>
	);
}
