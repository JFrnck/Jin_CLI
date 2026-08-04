import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';

interface PendingApproval {
	requestId: string;
	toolName: string;
	level: string;
	inputsHash: string;
	planSummary?: string | null | undefined;
	createdAt: string;
}

export function TasksView() {
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const [tasks, setTasks] = useState<PendingApproval[]>([]);

	useEffect(() => {
		async function fetchTasks() {
			try {
				const client = createApiClient();
				const {data, error, response} = await client.GET('/api/hitl/pending');

				if (error) {
					const httpStatus = (response as Response).status;
					if (httpStatus === 401) {
						setError(
							'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.',
						);
					} else {
						setError(
							`Error al obtener aprobaciones pendientes (HTTP ${httpStatus}).`,
						);
					}

					setLoading(false);
					return;
				}

				const pendingList = data || [];
				setTasks(
					pendingList.map(item => ({
						requestId: item.requestId,
						toolName: item.toolName,
						level: item.level,
						inputsHash: item.inputsHash,
						planSummary: item.planSummary,
						createdAt: String(item.createdAt),
					})),
				);
				setLoading(false);
			} catch (error_: unknown) {
				const msg = error_ instanceof Error ? error_.message : String(error_);
				setError(`Error al comunicarse con Jin Core: ${msg}`);
				setLoading(false);
			}
		}

		fetchTasks();
	}, []);

	if (loading) {
		return (
			<Box padding={1}>
				<Text color="yellow">
					⏳ Cargando tareas pendientes de aprobación...
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

	if (tasks.length === 0) {
		return (
			<Box padding={1} borderStyle="round" borderColor="green">
				<Text color="green" bold>
					🎉 No hay aprobaciones pendientes.
				</Text>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="yellow"
		>
			<Box marginBottom={1}>
				<Text color="yellow" bold>
					📋 Aprobaciones Pendientes ({tasks.length})
				</Text>
			</Box>
			{tasks.map((task, index) => (
				<Box
					key={task.requestId}
					flexDirection="column"
					marginBottom={1}
					paddingLeft={1}
				>
					<Text bold color="white">
						{index + 1}. [{task.level.toUpperCase()}]{' '}
						<Text color="cyan">{task.toolName}</Text>
					</Text>
					<Text color="gray">
						{' '}
						ID: <Text color="yellow">{task.requestId}</Text>
					</Text>
					{task.planSummary && (
						<Text color="gray"> Plan: {task.planSummary}</Text>
					)}
					<Text color="gray">
						{' '}
						Creado: {new Date(task.createdAt).toLocaleString()}
					</Text>
					<Text color="green">
						{' '}
						Usa `jin approve {task.requestId}` o `jin reject {task.requestId}`
					</Text>
				</Box>
			))}
		</Box>
	);
}
