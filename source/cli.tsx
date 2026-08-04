#!/usr/bin/env node
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ jin <command> [options]

	Commands
	  login <password>  Inicia sesión y guarda el token de forma segura
	  status            Consulta el estado de Jin Core, presupuesto y kill switch
	  tasks             Lista las aprobaciones HITL pendientes
	  approve <id>      Aprueba una acción pendiente
	  reject <id>       Rechaza una acción pendiente
	  chat              Inicia una sesión interactiva en tiempo real con Jin Agent
	  memory <query>    Busca en la memoria extendida semántica

	Examples
	  $ jin login <tu-contraseña>
	  $ jin status
	  $ jin tasks
	  $ jin approve req-abc-123
	  $ jin memory "preferencias de café"
`,
	{
		importMeta: import.meta,
		flags: {},
	},
);

const command = cli.input[0] || 'help';
const args = cli.input.slice(1);

render(<App command={command} args={args} flags={cli.flags} />);
