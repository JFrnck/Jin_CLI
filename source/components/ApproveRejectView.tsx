import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';

interface ApproveRejectViewProps {
	readonly action: 'approve' | 'reject';
	readonly requestId: string;
}

export function ApproveRejectView({action, requestId}: ApproveRejectViewProps) {
	const [loading, setLoading] = useState<boolean>(Boolean(requestId));
	const [outcomeType, setOutcomeType] = useState<
		| 'resolved'
		| 'awaiting-second'
		| 'rejected'
		| 'error'
		| 'too-early'
		| 'not-found'
	>(() => (requestId ? 'resolved' : 'error'));
	const [message, setMessage] = useState<string>(() =>
		requestId
			? ''
			: `Error: Debes especificar el ID de la solicitud. Uso: jin ${action} <requestId>`,
	);
	const [detailResult, setDetailResult] = useState<string>('');

	useEffect(() => {
		async function executeAction() {
			if (!requestId) return;

			try {
				const client = createApiClient();

				if (action === 'approve') {
					const {data, error, response} = await client.POST(
						'/api/hitl/{requestId}/approve',
						{
							params: {path: {requestId}},
						},
					);

					if (error) {
						const {status} = response as Response;
						switch (status) {
							case 409: {
								setOutcomeType('too-early');
								setMessage(
									`⚠️ Segunda aprobación intentada demasiado pronto para "${requestId}". Deben transcurrir al menos 30 segundos entre ambas aprobaciones.`,
								);

								break;
							}

							case 404: {
								setOutcomeType('not-found');
								setMessage(
									`⚠️ No se encontró ninguna aprobación pendiente con ID "${requestId}".`,
								);

								break;
							}

							case 401: {
								setOutcomeType('error');
								setMessage(
									'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.',
								);

								break;
							}

							default: {
								setOutcomeType('error');
								setMessage(`Error al aprobar solicitud (HTTP ${status}).`);
							}
						}

						setLoading(false);
						return;
					}

					if (data.outcome === 'awaiting-second') {
						setOutcomeType('awaiting-second');
						setMessage(
							`⚠️ Primera aprobación registrada (1 de 2 requeridas para dual-confirm). Debe transcurrir al menos 30s antes de emitir la segunda aprobación.`,
						);
					} else {
						setOutcomeType('resolved');
						setMessage(
							`✅ Acción aprobada y ejecutada exitosamente (${data.toolName})`,
						);
						setDetailResult(
							typeof data.result === 'string'
								? data.result
								: JSON.stringify(data.result, null, 2),
						);
					}
				} else {
					// Reject action
					const {error, response} = await client.POST(
						'/api/hitl/{requestId}/reject',
						{
							params: {path: {requestId}},
						},
					);

					if (error) {
						const {status} = response as Response;
						if (status === 404) {
							setOutcomeType('not-found');
							setMessage(
								`⚠️ No se encontró ninguna aprobación pendiente con ID "${requestId}".`,
							);
						} else if (status === 401) {
							setOutcomeType('error');
							setMessage(
								'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.',
							);
						} else {
							setOutcomeType('error');
							setMessage(`Error al rechazar solicitud (HTTP ${status}).`);
						}

						setLoading(false);
						return;
					}

					setOutcomeType('rejected');
					setMessage(`🚫 Solicitud "${requestId}" rechazada correctamente.`);
				}

				setLoading(false);
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : String(error);
				setOutcomeType('error');
				setMessage(`Error al procesar la solicitud: ${msg}`);
				setLoading(false);
			}
		}

		executeAction();
	}, [action, requestId]);

	if (loading) {
		return (
			<Box padding={1}>
				<Text color="yellow">
					⏳ Procesando {action === 'approve' ? 'aprobación' : 'rechazo'} para{' '}
					{requestId}...
				</Text>
			</Box>
		);
	}

	if (outcomeType === 'resolved') {
		return (
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="round"
				borderColor="green"
			>
				<Text color="green" bold>
					{message}
				</Text>
				{detailResult && (
					<Box marginTop={1} flexDirection="column">
						<Text color="gray">Resultado:</Text>
						<Text color="white">{detailResult}</Text>
					</Box>
				)}
			</Box>
		);
	}

	if (outcomeType === 'awaiting-second' || outcomeType === 'too-early') {
		return (
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="round"
				borderColor="yellow"
			>
				<Text color="yellow" bold>
					{message}
				</Text>
			</Box>
		);
	}

	if (outcomeType === 'rejected') {
		return (
			<Box
				flexDirection="column"
				padding={1}
				borderStyle="round"
				borderColor="gray"
			>
				<Text color="gray" bold>
					{message}
				</Text>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="red"
		>
			<Text color="red" bold>
				{message}
			</Text>
		</Box>
	);
}
