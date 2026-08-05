import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {createApiClient} from '../api/client.js';
import {saveToken} from '../config/auth-storage.js';

interface LoginViewProps {
	readonly password?: string;
}

export function LoginView({password: initialPassword}: LoginViewProps) {
	const [password, setPassword] = useState<string>(initialPassword ?? '');
	const [isSubmitted, setIsSubmitted] = useState<boolean>(
		Boolean(initialPassword),
	);
	const [status, setStatus] = useState<
		'idle' | 'loading' | 'success' | 'error'
	>(() => (initialPassword ? 'loading' : 'idle'));
	const [message, setMessage] = useState<string>(() =>
		initialPassword
			? 'Autenticando con el servidor...'
			: 'Por favor, ingresá tu contraseña:',
	);
	const [savedPath, setSavedPath] = useState<string>('');

	useEffect(() => {
		if (!isSubmitted || !password) {
			return;
		}

		setStatus('loading');
		setMessage('Autenticando con el servidor...');

		async function doLogin() {
			try {
				const client = createApiClient();
				const {data, error, response} = await client.POST('/api/auth/login', {
					body: {password},
				});

				if (error) {
					setStatus('error');
					const httpStatus = response.status;
					if (httpStatus === 401) {
						setMessage('Contraseña incorrecta. Acceso denegado.');
					} else if (httpStatus === 429) {
						setMessage(
							'Demasiados intentos fallidos (máximo 5 cada 15 min). Por favor esperá antes de intentar de nuevo.',
						);
					} else {
						setMessage(`Error al iniciar sesión (HTTP ${httpStatus}).`);
					}

					return;
				}

				if (data && data.accessToken) {
					const filePath = saveToken(data.accessToken);
					setSavedPath(filePath);
					setStatus('success');
					setMessage('¡Login exitoso!');
				} else {
					setStatus('error');
					setMessage(
						'Respuesta inválida del servidor: no se recibió accessToken.',
					);
				}
			} catch (error: unknown) {
				setStatus('error');
				const msg = error instanceof Error ? error.message : String(error);
				setMessage(`Error de red o servidor no disponible: ${msg}`);
			}
		}

		doLogin();
	}, [isSubmitted, password]);

	if (status === 'idle') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">🔑 {message}</Text>
				<Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
					<TextInput
						value={password}
						onChange={setPassword}
						onSubmit={() => {
							if (password) {
								setIsSubmitted(true);
							}
						}}
						mask="*"
					/>
				</Box>
			</Box>
		);
	}

	if (status === 'loading') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">⏳ {message}</Text>
			</Box>
		);
	}

	if (status === 'error') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">❌ {message}</Text>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="green"
		>
			<Text color="green" bold>
				✅ {message}
			</Text>
			<Text color="gray">
				Token guardado de forma segura en:{' '}
				<Text color="white">{savedPath}</Text> (permisos 0600)
			</Text>
		</Box>
	);
}
