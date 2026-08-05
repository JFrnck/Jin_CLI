import {io, type Socket} from 'socket.io-client';
import {getBaseUrl} from './client.js';
import {getToken} from '../config/auth-storage.js';

export interface ChatTurnResponse {
	finalResponse: string;
	plan: {steps: Array<{description: string; status: string; note?: string}>};
	pendingApprovals: Array<{requestId: string; toolName: string}>;
	iterationsUsed: number;
}

export interface WsChatCallbacks {
	onConnect?: () => void;
	onResponse?: (response: ChatTurnResponse) => void;
	onError?: (error: {message: string}) => void;
	onAuthError?: (reason: string) => void;
	onDisconnect?: (reason: string) => void;
}

export function createWsChatSocket(callbacks: WsChatCallbacks = {}): Socket {
	const baseUrl = getBaseUrl();
	const token = getToken();

	const socket = io(`${baseUrl}/chat`, {
		auth: {token: token ?? ''},
		transports: ['websocket', 'polling'],
		autoConnect: false,
		reconnection: true,
	});

	socket.on('connect', () => {
		callbacks.onConnect?.();
	});

	socket.on('chat:response', (data: ChatTurnResponse) => {
		callbacks.onResponse?.(data);
	});

	socket.on('chat:error', (data: {message: string}) => {
		callbacks.onError?.(data);
	});

	socket.on('disconnect', reason => {
		// Si la desconexión ocurrió inmediatamente tras conectar por auth err (client.disconnect(true) en Nest)
		if (reason === 'io server disconnect') {
			callbacks.onAuthError?.(
				'Sesión expirada o token inválido. Por favor ejecutá `jin login` de nuevo.',
			);
		}

		callbacks.onDisconnect?.(reason);
	});

	socket.on('connect_error', err => {
		callbacks.onAuthError?.(`Error de conexión WebSocket: ${err.message}`);
	});

	return socket;
}
