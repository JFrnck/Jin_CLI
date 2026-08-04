import {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {createApiClient} from '../api/client.js';

interface StatusData {
	dailyRatio: number;
	percent: number;
	killSwitchActive: boolean;
	serverHealth: boolean;
}

export function StatusView() {
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const [data, setData] = useState<StatusData | undefined>(undefined);

	useEffect(() => {
		async function fetchStatus() {
			try {
				const client = createApiClient();

				// Consultar presupuesto y kill switch
				const {
					data: bData,
					error: bErr,
					response: bResp,
				} = await client.GET('/api/budget');
				if (bErr) {
					const httpStatus = (bResp as Response).status;
					if (httpStatus === 401) {
						setError(
							'Sesión expirada o no autenticada. Por favor ejecutá `jin login` primero.',
						);
					} else {
						setError(`Error al consultar presupuesto (HTTP ${httpStatus}).`);
					}

					setLoading(false);
					return;
				}

				// Consultar health check
				let serverHealth = false;
				try {
					const {error: hErr} = await client.GET('/');
					serverHealth = !hErr;
				} catch {
					serverHealth = false;
				}

				const dailyRatio = bData?.dailyUsageRatio ?? 0;
				const percent = Math.min(999, Math.round(dailyRatio * 100));
				const killSwitchActive = bData?.killSwitchActive ?? false;

				setData({
					dailyRatio,
					percent,
					killSwitchActive,
					serverHealth,
				});
				setLoading(false);
			} catch (error_: unknown) {
				const msg = error_ instanceof Error ? error_.message : String(error_);
				setError(`Error de comunicación con Jin Core: ${msg}`);
				setLoading(false);
			}
		}

		fetchStatus();
	}, []);

	if (loading) {
		return (
			<Box padding={1}>
				<Text color="yellow">⏳ Consultando estado de Jin Core...</Text>
			</Box>
		);
	}

	if (error || !data) {
		return (
			<Box padding={1}>
				<Text color="red">❌ {error || 'Error desconocido'}</Text>
			</Box>
		);
	}

	// Generar barra de progreso visual de presupuesto
	const filledBars = Math.min(10, Math.floor(data.percent / 10));
	const emptyBars = Math.max(0, 10 - filledBars);
	const progressBar = `[${'█'.repeat(filledBars)}${'-'.repeat(emptyBars)}]`;

	return (
		<Box
			flexDirection="column"
			padding={1}
			borderStyle="round"
			borderColor="cyan"
		>
			<Text color="cyan" bold>
				🤖 Jin System Status
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					• Servidor Jin Core:{' '}
					{data.serverHealth ? (
						<Text color="green">🟢 En línea</Text>
					) : (
						<Text color="red">🔴 Desconectado</Text>
					)}
				</Text>
				<Text>
					• Presupuesto Diario:{' '}
					<Text color={data.percent >= 80 ? 'red' : 'green'}>
						{progressBar} {data.percent}%
					</Text>
				</Text>
				<Text>
					• Kill Switch:{' '}
					{data.killSwitchActive ? (
						<Text color="red" bold>
							🔴 ACTIVO (usa `jin unpause` o Telegram /unpause para reanudar)
						</Text>
					) : (
						<Text color="green">🟢 Inactivo</Text>
					)}
				</Text>
			</Box>
		</Box>
	);
}
