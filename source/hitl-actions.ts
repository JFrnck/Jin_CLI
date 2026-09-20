import {createApiClient} from './api/client.js';

export type ApprovalAction = 'approve' | 'reject';

export type ApprovalOutcomeType =
	| 'resolved'
	| 'awaiting-second'
	| 'rejected'
	| 'error'
	| 'too-early'
	| 'not-found';

export interface ApprovalOutcome {
	readonly type: ApprovalOutcomeType;
	readonly message: string;
	readonly detail?: string;
}

export const UNAUTHENTICATED =
	'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.';

type Client = ReturnType<typeof createApiClient>;

async function approve(
	client: Client,
	requestId: string,
): Promise<ApprovalOutcome> {
	const {data, error, response} = await client.POST(
		'/api/hitl/{requestId}/approve',
		{params: {path: {requestId}}},
	);

	if (error) {
		const {status} = response as Response;
		switch (status) {
			case 409: {
				// Dos causas distintas comparten el 409: la segunda aprobación llegó
				// antes de 30 s, o (issue Jin_Core #36) otra solicitud ya está
				// ejecutando/resolvió esta aprobación. El servidor las distingue con
				// `code`.
				if (
					(error as {code?: string}).code === 'HITL_APPROVAL_ALREADY_RESOLVED'
				) {
					return {
						type: 'not-found',
						message: `⚠️ La aprobación "${requestId}" ya está siendo ejecutada o ya fue resuelta por otra solicitud. No se ejecuta dos veces.`,
					};
				}

				return {
					type: 'too-early',
					message: `⚠️ Segunda aprobación intentada demasiado pronto para "${requestId}". Deben transcurrir al menos 30 segundos entre ambas aprobaciones.`,
				};
			}

			case 404: {
				return {
					type: 'not-found',
					message: `⚠️ No se encontró ninguna aprobación pendiente con ID "${requestId}".`,
				};
			}

			case 401: {
				return {type: 'error', message: UNAUTHENTICATED};
			}

			default: {
				return {
					type: 'error',
					message: `Error al aprobar solicitud (HTTP ${status}).`,
				};
			}
		}
	}

	if (data.outcome === 'awaiting-second') {
		return {
			type: 'awaiting-second',
			message: `⚠️ Primera aprobación registrada (1 de 2 requeridas para dual-confirm). Debe transcurrir al menos 30s antes de emitir la segunda aprobación.`,
		};
	}

	return {
		type: 'resolved',
		message: `✅ Acción aprobada y ejecutada exitosamente (${data.toolName})`,
		detail:
			typeof data.result === 'string'
				? data.result
				: JSON.stringify(data.result, null, 2),
	};
}

async function reject(
	client: Client,
	requestId: string,
): Promise<ApprovalOutcome> {
	const {error, response} = await client.POST('/api/hitl/{requestId}/reject', {
		params: {path: {requestId}},
	});

	if (error) {
		const {status} = response as Response;
		if (status === 404) {
			return {
				type: 'not-found',
				message: `⚠️ No se encontró ninguna aprobación pendiente con ID "${requestId}".`,
			};
		}

		if (status === 401) {
			return {type: 'error', message: UNAUTHENTICATED};
		}

		return {
			type: 'error',
			message: `Error al rechazar solicitud (HTTP ${status}).`,
		};
	}

	return {
		type: 'rejected',
		message: `🚫 Solicitud "${requestId}" rechazada correctamente.`,
	};
}

/**
 * Aprobar/rechazar una acción HITL pendiente. Lo comparten `jin approve|reject
 * <id>` y la bandeja interactiva (`jin inbox`) para que ambos digan exactamente
 * lo mismo, incluida la distinción del 409 (issue Jin_Core #36).
 */
export async function resolveApproval(
	action: ApprovalAction,
	requestId: string,
): Promise<ApprovalOutcome> {
	try {
		const client = createApiClient();
		return action === 'approve'
			? await approve(client, requestId)
			: await reject(client, requestId);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			type: 'error',
			message: `Error al procesar la solicitud: ${message}`,
		};
	}
}
