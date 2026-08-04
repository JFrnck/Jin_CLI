import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';

interface MemoryItem {
	id: number;
	content: string;
	tipo: string;
	fuente?: string;
	fecha?: string;
}

interface MemoryViewProps {
	readonly query?: string;
}

export function MemoryView({query}: MemoryViewProps) {
	const [loading, setLoading] = useState<boolean>(Boolean(query));
	const [error, setError] = useState<string | undefined>(() =>
		query
			? undefined
			: 'Falta la consulta de búsqueda. Uso: jin memory <query>',
	);
	const [memories, setMemories] = useState<MemoryItem[]>([]);

	useEffect(() => {
		if (!query) return;

		async function fetchMemory() {
			try {
				const client = createApiClient();
				const {data, error, response} = await client.POST(
					'/api/memory/recall',
					{
						body: {query: query!, k: 5},
					},
				);

				if (error) {
					const httpStatus = (response as Response).status;
					if (httpStatus === 401) {
						setError(
							'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.',
						);
					} else {
						setError(`Error al consultar memoria (HTTP ${httpStatus}).`);
					}

					setLoading(false);
					return;
				}

				const memoryList = data || [];
				setMemories(memoryList as MemoryItem[]);
				setLoading(false);
			} catch (error_: unknown) {
				const msg = error_ instanceof Error ? error_.message : String(error_);
				setError(`Error de comunicación con Jin Core: ${msg}`);
				setLoading(false);
			}
		}

		fetchMemory();
	}, [query]);

	if (loading) {
		return (
			<Box padding={1}>
				<Text color="yellow">
					🧠 Buscando en la memoria extendida de Jin para "{query}"...
				</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box padding={1}>
				<Text color="red">❌ {error}</Text>
			</Box>
		);
	}

	if (memories.length === 0) {
		return (
			<Box padding={1} borderStyle="round" borderColor="yellow">
				<Text color="yellow">
					🧠 No se encontraron recuerdos semánticamente relevantes para "{query}
					".
				</Text>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="magenta"
		>
			<Box marginBottom={1}>
				<Text color="magenta" bold>
					🧠 Recuerdos Encontrados ({memories.length})
				</Text>
			</Box>
			{memories.map((m, idx) => (
				<Box
					key={m.id || idx}
					flexDirection="column"
					marginBottom={1}
					paddingLeft={1}
				>
					<Text bold color="white">
						{idx + 1}. 📌 <Text color="yellow">[{m.tipo}]</Text> {m.content}
					</Text>
				</Box>
			))}
		</Box>
	);
}
