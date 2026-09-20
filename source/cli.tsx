#!/usr/bin/env node
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ jin <command> [options]

	Commands
	  login             Inicia sesión y guarda el token de forma segura
	  status            Consulta el estado de Jin Core, presupuesto y kill switch
	  tasks             Lista las aprobaciones HITL pendientes
	  approve <id>      Aprueba una acción pendiente
	  reject <id>       Rechaza una acción pendiente
	  chat              Inicia una sesión interactiva en tiempo real con Jin Agent
	  memory <query>    Busca en la memoria extendida semántica
	  mode [modo] [h]   Ver o cambiar la autonomía del HITL: safe | semi | auto
	  inbox             Bandeja de aprobaciones con menú de flechas (aprobar/rechazar)
	  budget [unpause]  Ver el presupuesto o reactivar el agente tras el kill switch
	  audit [cantidad]  Últimas entradas del audit log
	  previews [stop]   Listar o detener previews
	  runs [runId]      Ejecuciones del orquestador y sus tickets

	Options
	  --password-stdin  Lee la contraseña directamente desde stdin (para automatización)
	  --yes             Salta la confirmación de 'budget unpause' y 'previews stop <id>' (scripts)

	Examples
	  $ jin login
	  $ echo "pwd" | jin login --password-stdin
	  $ jin status
	  $ jin tasks
	  $ jin approve req-abc-123
	  $ jin memory "preferencias de café"
	  $ jin mode
	  $ jin mode auto 2
	  $ jin mode safe
	  $ jin inbox
	  $ jin budget unpause
	  $ jin audit 50
`,
	{
		importMeta: import.meta,
		flags: {
			passwordStdin: {
				type: 'boolean',
			},
			yes: {
				type: 'boolean',
			},
		},
	},
);

const command = cli.input[0] || 'help';
const args = cli.input.slice(1);

render(<App command={command} args={args} flags={cli.flags} />);
