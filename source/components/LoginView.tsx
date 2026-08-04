import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';
import {saveToken} from '../config/auth-storage.js';

interface LoginViewProps {
	readonly password?: string;
}

export function LoginView({password}: LoginViewProps) {
	const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
		password ? 'loading' : 'error',
	);
	const [message, setMessage] = useState<string>(() =>
		password
			? 'Autenticando con el servidor...'
			: 'Falta la contraseña. Uso: jin login <password>',
	);
	const [savedPath, setSavedPath] = useState<string>('');

	useEffect(() => {
		if (!password) {
			return;
		}

		async function doLogin() {
			try {
				const client = createApiClient();
				const {data, error, response} = await client.POST('/api/auth/login', {
					body: {password: password!},
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
	}, [password]);

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
