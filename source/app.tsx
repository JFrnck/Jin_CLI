import {Box, Text} from 'ink';
import {LoginView} from './components/LoginView.js';
import {StatusView} from './components/StatusView.js';
import {TasksView} from './components/TasksView.js';
import {ApproveRejectView} from './components/ApproveRejectView.js';
import {ChatView} from './components/ChatView.js';
import {MemoryView} from './components/MemoryView.js';

export interface AppProps {
	readonly command: string;
	readonly args: string[];
	readonly flags: Record<string, unknown>;
}

export default function App({command, args}: AppProps) {
	const normalizedCmd = command ? command.toLowerCase() : 'help';

	switch (normalizedCmd) {
		case 'login': {
			const password = args[0];
			return <LoginView {...(password ? {password} : {})} />;
		}

		case 'status': {
			return <StatusView />;
		}

		case 'tasks': {
			return <TasksView />;
		}

		case 'approve': {
			const requestId = args[0] || '';
			return <ApproveRejectView action="approve" requestId={requestId} />;
		}

		case 'reject': {
			const requestId = args[0] || '';
			return <ApproveRejectView action="reject" requestId={requestId} />;
		}

		case 'chat': {
			return <ChatView />;
		}

		case 'memory': {
			const query = args.join(' ');
			return <MemoryView query={query} />;
		}

		case 'help':
		default: {
			return (
				<Box
					flexDirection="column"
					padding={1}
					borderStyle="round"
					borderColor="cyan"
				>
					<Box marginBottom={1}>
						<Text color="cyan" bold>
							🤖 Jin CLI — Orquestador de Agentes Personal
						</Text>
					</Box>
					<Text bold color="yellow">
						Comandos Disponibles:
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin login &lt;contraseña&gt;</Text> :
						Autenticarse y guardar token en ~/.config/jin/auth.json (0600)
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin status</Text> : Estado del servidor,
						presupuesto diario y kill switch
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin tasks</Text> : Listar aprobaciones HITL
						pendientes
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin approve &lt;id&gt;</Text> : Aprobar una
						acción pendiente
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin reject &lt;id&gt;</Text> : Rechazar una
						acción pendiente
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin chat</Text> : Sesión interactiva en tiempo
						real con el agente
					</Text>
					<Text>
						{' '}
						• <Text color="green">jin memory &lt;query&gt;</Text> : Buscar
						recuerdos en la memoria extendida
					</Text>
				</Box>
			);
		}
	}
}
