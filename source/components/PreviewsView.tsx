import {useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import {createApiClient} from '../api/client.js';
import {parsePreviewsArgs} from '../admin/args.js';
import {Confirm} from '../admin/Confirm.js';
import {formatTimestamp} from '../admin/format.js';
import {describeError, unwrap, useLoad} from '../admin/load.js';
import {useInteractive} from '../admin/useInteractive.js';
import type {components} from '../api-types.js';

type Preview = components['schemas']['PreviewServiceDto_Output'];

interface PreviewsViewProps {
	readonly args: readonly string[];
	/** `--yes`: salta la confirmación (scripts sin TTY). */
	readonly isConfirmed?: boolean;
}

type Phase =
	| {readonly name: 'idle'}
	| {readonly name: 'confirm'; readonly id: string}
	| {readonly name: 'busy'}
	| {readonly name: 'message'; readonly text: string; readonly ok: boolean};

const USAGE = 'Uso: jin previews · jin previews stop [id] [--yes]';

async function fetchPreviews(): Promise<Preview[]> {
	const client = createApiClient();
	return unwrap(
		await client.GET('/api/preview-services'),
		'listar los previews',
	);
}

async function stopPreview(serviceId: string): Promise<void> {
	const client = createApiClient();
	unwrap(
		await client.DELETE('/api/preview-services/{serviceId}', {
			params: {path: {serviceId}},
		}),
		'detener el preview',
	);
}

function describe(item: Preview): string {
	return `${item.slug} [${item.status}] ${item.url} — vence ${formatTimestamp(
		item.expiresAt,
	)}`;
}

export function PreviewsView({args, isConfirmed = false}: PreviewsViewProps) {
	const [command] = useState(() => parsePreviewsArgs(args));
	const interactive = useInteractive();
	const [reloadKey, setReloadKey] = useState(0);
	const [phase, setPhase] = useState<Phase>(() =>
		command.kind === 'stop' && command.serviceId && !isConfirmed
			? {name: 'confirm', id: command.serviceId}
			: {name: 'idle'},
	);
	const started = useRef(false);
	const loaded = useLoad(fetchPreviews, reloadKey);

	const stop = (id: string) => {
		setPhase({name: 'busy'});
		stopPreview(id)
			.then(() => {
				setPhase({
					name: 'message',
					text: `🛑 Preview "${id}" detenido.`,
					ok: true,
				});
				setReloadKey(key => key + 1);
			})
			.catch((error: unknown) => {
				setPhase({name: 'message', text: describeError(error), ok: false});
			});
	};

	const directId = command.kind === 'stop' ? command.serviceId : undefined;
	useEffect(() => {
		if (isConfirmed && directId && !started.current) {
			started.current = true;
			stop(directId);
		}
	}, [isConfirmed, directId]);

	if (command.kind === 'invalid') {
		return (
			<Box padding={1}>
				<Text color="red">❌ {USAGE}</Text>
			</Box>
		);
	}

	if (phase.name === 'busy') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Procesando...</Text>
			</Box>
		);
	}

	if (phase.name === 'message') {
		return (
			<Box padding={1}>
				<Text color={phase.ok ? 'green' : 'red'}>{phase.text}</Text>
			</Box>
		);
	}

	if (phase.name === 'confirm') {
		if (!interactive) {
			return (
				<Box padding={1}>
					<Text color="yellow">
						Sin terminal interactiva: repite con `--yes` para confirmar.
					</Text>
				</Box>
			);
		}

		const {id} = phase;
		return (
			<Box padding={1}>
				<Confirm
					key={id}
					question={`¿Detener el preview "${id}"?`}
					confirmLabel="Sí, detener"
					onCancel={() => {
						setPhase({name: 'message', text: 'Cancelado.', ok: true});
					}}
					onConfirm={() => {
						stop(id);
					}}
				/>
			</Box>
		);
	}

	// Sin id directo (o `jin previews` a secas): hace falta la lista.
	if (loaded.status === 'loading') {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Consultando los previews...</Text>
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
			<Box padding={1}>
				<Text color="gray">No hay previews activos.</Text>
			</Box>
		);
	}

	if (command.kind === 'stop' && interactive) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow" bold>
					¿Cuál detener? (↑↓ y Enter)
				</Text>
				<SelectInput
					key="pick"
					items={items.map(item => ({label: describe(item), value: item.id}))}
					onSelect={choice => {
						setPhase({name: 'confirm', id: choice.value});
					}}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="cyan">
				🌐 Previews ({items.length})
			</Text>
			{items.map(item => (
				<Text key={item.id}>
					{item.id} {describe(item)}
				</Text>
			))}
			{command.kind === 'stop' && (
				<Text color="gray">
					Sin terminal interactiva: `jin previews stop &lt;id&gt; --yes`.
				</Text>
			)}
		</Box>
	);
}
