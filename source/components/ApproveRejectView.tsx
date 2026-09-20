import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {resolveApproval, type ApprovalOutcomeType} from '../hitl-actions.js';

interface ApproveRejectViewProps {
	readonly action: 'approve' | 'reject';
	readonly requestId: string;
}

export function ApproveRejectView({action, requestId}: ApproveRejectViewProps) {
	const [loading, setLoading] = useState<boolean>(Boolean(requestId));
	const [outcomeType, setOutcomeType] = useState<ApprovalOutcomeType>(() =>
		requestId ? 'resolved' : 'error',
	);
	const [message, setMessage] = useState<string>(() =>
		requestId
			? ''
			: `Error: Debes especificar el ID de la solicitud. Uso: jin ${action} <requestId>`,
	);
	const [detailResult, setDetailResult] = useState<string>('');

	useEffect(() => {
		if (!requestId) return;

		resolveApproval(action, requestId)
			.then(outcome => {
				setOutcomeType(outcome.type);
				setMessage(outcome.message);
				setDetailResult(outcome.detail ?? '');
				setLoading(false);
			})
			.catch((error: unknown) => {
				// `resolveApproval` no lanza; esto es solo defensa.
				setOutcomeType('error');
				setMessage(
					`Error al procesar la solicitud: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				setLoading(false);
			});
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
