import {useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import {createApiClient} from '../api/client.js';
import {parseRunsArgs} from '../admin/args.js';
import {formatTimestamp, truncate} from '../admin/format.js';
import {unwrap, useLoad} from '../admin/load.js';
import {useInteractive} from '../admin/useInteractive.js';

interface RunsViewProps {
	readonly args: readonly string[];
}

const USAGE = 'Uso: jin runs · jin runs <runId>';

const STATUS_ICON: Record<string, string> = {
	running: '🔄',
	blocked: '⏸',
	done: '✅',
	failed: '❌',
	killed: '🛑',
	pending: '⏳',
	'in-progress': '🔄',
};

async function fetchRuns() {
	const client = createApiClient();
	return unwrap(
		await client.GET('/api/orchestrator/runs', {params: {query: {}}}),
		'listar las ejecuciones',
	);
}

async function fetchRun(runId: string) {
	const client = createApiClient();
	return unwrap(
		await client.GET('/api/orchestrator/runs/{runId}', {
			params: {path: {runId}},
		}),
		`obtener la ejecución ${runId}`,
	);
}

function RunDetail({runId}: {readonly runId: string}) {
	const loaded = useLoad(async () => fetchRun(runId));

	if (loaded.status === 'loading') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Cargando la ejecución...</Text>
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

	const {run, tickets} = loaded.data;
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>
				{STATUS_ICON[run.status] ?? '•'} {run.objective}
			</Text>
			<Text color="gray">
				{run.id} · {run.status} · {formatTimestamp(run.createdAt)}
				{run.completedAt ? ` → ${formatTimestamp(run.completedAt)}` : ''}
			</Text>
			{run.finalResponse && (
				<Text>Respuesta final: {truncate(run.finalResponse, 400)}</Text>
			)}
			<Box marginTop={1} flexDirection="column">
				<Text bold color="cyan">
					Tickets ({tickets.length})
				</Text>
				{tickets.map(ticket => (
					<Box key={ticket.id} flexDirection="column">
						<Text>
							{STATUS_ICON[ticket.status] ?? '•'}{' '}
							{truncate(ticket.description, 90)}
						</Text>
						{ticket.result && (
							<Text color="gray"> → {truncate(ticket.result, 120)}</Text>
						)}
						{ticket.comments.length > 0 && (
							<Text color="gray"> {ticket.comments.length} comentario(s)</Text>
						)}
					</Box>
				))}
			</Box>
		</Box>
	);
}

export function RunsView({args}: RunsViewProps) {
	const [command] = useState(() => parseRunsArgs(args));

	if (command.kind === 'invalid') {
		return (
			<Box padding={1}>
				<Text color="red">❌ {USAGE}</Text>
			</Box>
		);
	}

	return command.kind === 'detail' ? (
		<RunDetail runId={command.runId} />
	) : (
		<RunsList />
	);
}

function RunsList() {
	const interactive = useInteractive();
	const [picked, setPicked] = useState<string | undefined>(undefined);
	const loaded = useLoad(fetchRuns);

	if (picked) return <RunDetail runId={picked} />;

	if (loaded.status === 'loading') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Consultando las ejecuciones...</Text>
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

	const {items} = loaded.data;
	if (items.length === 0) {
		return (
			<Box padding={1}>
				<Text color="gray">No hay ejecuciones del orquestador.</Text>
			</Box>
		);
	}

	const describe = (run: (typeof items)[number]) =>
		`${STATUS_ICON[run.status] ?? '•'} ${formatTimestamp(
			run.createdAt,
		)} ${truncate(run.objective, 70)}`;

	if (interactive) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text bold color="cyan">
					🤖 Ejecuciones del orquestador — ↑↓ y Enter para ver los tickets
				</Text>
				<SelectInput
					key="runs"
					items={items.map(run => ({label: describe(run), value: run.id}))}
					onSelect={choice => {
						setPicked(choice.value);
					}}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				🤖 Ejecuciones del orquestador ({items.length})
			</Text>
			{items.map(run => (
				<Text key={run.id}>
					{run.id} {describe(run)}
				</Text>
			))}
		</Box>
	);
}
