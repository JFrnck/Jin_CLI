import {useEffect, useState, useRef} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import {createWsChatSocket, type ChatTurnResponse} from '../api/ws-chat.js';
import {createApiClient} from '../api/client.js';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

export function ChatView() {
	const {exit} = useApp();
	const [sessionId] = useState<string>(() => crypto.randomUUID());
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputText, setInputText] = useState<string>('');
	const [isThinking, setIsThinking] = useState<boolean>(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);
	const [socketConnected, setSocketConnected] = useState<boolean>(false);

	// Guardar Socket.IO ref y history en ref/state
	const socketRef = useRef<ReturnType<typeof createWsChatSocket> | undefined>(
		undefined,
	);
	const messagesRef = useRef<ChatMessage[]>([]);
	messagesRef.current = messages;

	useEffect(() => {
		const ws = createWsChatSocket({
			onConnect() {
				setSocketConnected(true);
			},
			onResponse(response: ChatTurnResponse) {
				setIsThinking(false);
				const newAssistantMsg: ChatMessage = {
					role: 'assistant',
					content: response.finalResponse,
				};
				setMessages(prev => [...prev, newAssistantMsg]);
			},
			onError(err) {
				setIsThinking(false);
				setMessages(prev => [
					...prev,
					{
						role: 'assistant',
						content: `⚠️ Error en turno de agente: ${err.message}`,
					},
				]);
			},
			onAuthError(reason) {
				setIsThinking(false);
				setAuthError(reason);
			},
		});

		socketRef.current = ws;
		ws.connect();

		return () => {
			ws.disconnect();
		};
	}, []);

	const handleSend = async (userObjective: string) => {
		if (!userObjective.trim() || isThinking || authError) return;

		const userMsg: ChatMessage = {role: 'user', content: userObjective};
		setMessages(prev => [...prev, userMsg]);
		setIsThinking(true);
		setInputText('');

		const currentHistory = messagesRef.current;

		// Intentar envío vía WebSocket si está conectado
		if (socketRef.current && socketRef.current.connected) {
			socketRef.current.emit('chat:message', {
				sessionId,
				objective: userObjective,
				history: currentHistory,
			});
		} else {
			// Fallback a REST `POST /api/chat`
			try {
				const client = createApiClient();
				const {data, error, response} = await client.POST('/api/chat', {
					body: {
						sessionId,
						objective: userObjective,
						history: currentHistory,
					},
				});

				setIsThinking(false);

				if (error) {
					const httpStatus = (response as Response).status;
					if (httpStatus === 401) {
						setAuthError(
							'Sesión expirada o token inválido. Por favor ejecutá `jin login` de nuevo.',
						);
					} else {
						setMessages(prev => [
							...prev,
							{
								role: 'assistant',
								content: `⚠️ Error HTTP ${httpStatus} al comunicarse con Jin Core.`,
							},
						]);
					}

					return;
				}

				if (data) {
					setMessages(prev => [
						...prev,
						{role: 'assistant', content: data.finalResponse},
					]);
				}
			} catch (error: unknown) {
				setIsThinking(false);
				const msg = error instanceof Error ? error.message : String(error);
				setMessages(prev => [
					...prev,
					{role: 'assistant', content: `⚠️ Error de conexión: ${msg}`},
				]);
			}
		}
	};

	useInput((input, key) => {
		if (key.escape || (key.ctrl && input === 'c')) {
			exit();
			return;
		}

		if (key.return) {
			handleSend(inputText);
			return;
		}

		if (key.backspace || key.delete) {
			setInputText(prev => prev.slice(0, -1));
			return;
		}

		if (input && !key.ctrl && !key.meta) {
			setInputText(prev => prev + input);
		}
	});

	if (authError) {
		return (
			<Box padding={1} borderStyle="round" borderColor="red">
				<Text color="red" bold>
					❌ {authError}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box
				borderStyle="single"
				borderColor="cyan"
				paddingX={1}
				marginBottom={1}
			>
				<Text color="cyan" bold>
					🤖 Jin Agent Interactive Session (ID: {sessionId.slice(0, 8)}){' '}
					{socketConnected ? '🟢 WS' : '🟡 REST'}
				</Text>
			</Box>

			{messages.map((m, idx) => (
				<Box key={idx} marginBottom={1} flexDirection="column">
					<Text bold color={m.role === 'user' ? 'green' : 'cyan'}>
						{m.role === 'user' ? '👤 Tú' : '🤖 Jin'}:
					</Text>
					<Box paddingLeft={2}>
						<Text color="white">{m.content}</Text>
					</Box>
				</Box>
			))}

			{isThinking && (
				<Box marginBottom={1}>
					<Text color="yellow">
						⏳ Jin está pensando y ejecutando herramientas...
					</Text>
				</Box>
			)}

			<Box
				borderStyle="round"
				borderColor="gray"
				paddingX={1}
				flexDirection="row"
			>
				<Text bold color="green">
					{'> '}{' '}
				</Text>
				<Text>{inputText}</Text>
				<Text color="gray"> ▌</Text>
			</Box>
			<Box marginTop={1}>
				<Text color="gray" dimColor>
					Presioná Enter para enviar, Esc o Ctrl+C para salir.
				</Text>
			</Box>
		</Box>
	);
}
