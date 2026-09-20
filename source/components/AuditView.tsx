import {useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {createApiClient} from '../api/client.js';
import {parseAuditArgs} from '../admin/args.js';
import {formatTimestamp, truncate} from '../admin/format.js';
import {unwrap, useLoad} from '../admin/load.js';
import {useInteractive} from '../admin/useInteractive.js';

interface AuditViewProps {
	readonly args: readonly string[];
}

const USAGE = 'Uso: jin audit [cantidad 1-200]';

export function AuditView({args}: AuditViewProps) {
	const [command] = useState(() => parseAuditArgs(args));
	const interactive = useInteractive();
	const {exit} = useApp();
	// Pila de cursores: la página actual es la última. `undefined` = la más reciente.
	const [cursors, setCursors] = useState<Array<string | undefined>>([
		undefined,
	]);
	const [navigation, setNavigation] = useState(0);
	const limit = command.kind === 'list' ? command.limit : 0;
	const cursor = cursors.at(-1);

	const loaded = useLoad(async () => {
		if (command.kind !== 'list') return undefined;
		const client = createApiClient();
		return unwrap(
			await client.GET('/api/audit', {
				params: {query: {limit, ...(cursor ? {cursor} : {})}},
			}),
			'consultar el audit log',
		);
	}, navigation);

	const page = loaded.status === 'ok' ? loaded.data : undefined;

	useInput(
		(input, key) => {
			if (input === 'q' || key.escape) exit();
			if (input === 'n' && page?.nextCursor) {
				const {nextCursor} = page;
				setCursors(previous => [...previous, nextCursor]);
				setNavigation(n => n + 1);
			}

			if (input === 'b' && cursors.length > 1) {
				setCursors(previous => previous.slice(0, -1));
				setNavigation(n => n + 1);
			}
		},
		{isActive: interactive && command.kind === 'list'},
	);

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
				<Text color="yellow">⏳ Consultando el audit log...</Text>
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

	if (!page || page.items.length === 0) {
		return (
			<Box padding={1}>
				<Text color="gray">El audit log no tiene entradas.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				🧾 Audit log (más recientes primero) — página {cursors.length}
			</Text>
			{page.items.map(item => (
				<Text key={item.id}>
					<Text color="gray">{formatTimestamp(item.timestamp)} </Text>
					<Text color="yellow">{item.actionType} </Text>
					<Text color="cyan">{item.toolName ?? '—'} </Text>
					<Text>[{item.approvalStatus}] </Text>
					<Text color="gray">
						{item.actor}
						{item.approver ? ` → ${item.approver}` : ''}
						{item.planSummary ? ` · ${truncate(item.planSummary, 60)}` : ''}
					</Text>
				</Text>
			))}
			{interactive ? (
				<Text color="gray">
					{page.nextCursor ? 'n: más antiguas · ' : ''}
					{cursors.length > 1 ? 'b: volver · ' : ''}q: salir
				</Text>
			) : (
				page.nextCursor && (
					<Text color="gray">
						Hay entradas más antiguas (usa una terminal interactiva o aumenta la
						cantidad).
					</Text>
				)
			)}
		</Box>
	);
}
