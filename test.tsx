import test from 'ava';
import {render} from 'ink-testing-library';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import App from './source/app.js';
import {saveToken, getToken, clearToken} from './source/config/auth-storage.js';
import {LoginView} from './source/components/LoginView.js';
import {ApproveRejectView} from './source/components/ApproveRejectView.js';
import {MemoryView} from './source/components/MemoryView.js';
import {ModeView} from './source/components/ModeView.js';
import {parseModeArgs} from './source/mode-args.js';

test.beforeEach(() => {
	process.env['JIN_CONFIG_DIR'] = path.join(
		os.tmpdir(),
		`jin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
});

test.afterEach.always(() => {
	clearToken();
	if (
		process.env['JIN_CONFIG_DIR'] &&
		fs.existsSync(process.env['JIN_CONFIG_DIR'])
	) {
		fs.rmSync(process.env['JIN_CONFIG_DIR'], {recursive: true, force: true});
	}
});

test('auth-storage: guarda token con permisos POSIX 0600 y lo recupera correctamente', t => {
	const token = 'test-bearer-token-123';
	const filePath = saveToken(token);

	t.is(getToken(), token);
	t.true(fs.existsSync(filePath));

	if (process.platform !== 'win32') {
		const stats = fs.statSync(filePath);
		const mode = stats.mode & 0o777;
		t.is(mode, 0o600);
	}
});

test('App Component: ayuda por defecto si no se pasa comando', t => {
	const {lastFrame} = render(<App command="help" args={[]} flags={{}} />);
	t.true(lastFrame()?.includes('Comandos Disponibles:'));
	t.true(lastFrame()?.includes('jin login'));
});

test('LoginView: muestra prompt interactivo si no hay contraseña', t => {
	const {lastFrame} = render(<LoginView />);
	t.true(lastFrame()?.includes('Por favor, ingresá tu contraseña'));
});

test('ApproveRejectView: error si falta requestId', t => {
	const {lastFrame} = render(
		<ApproveRejectView action="approve" requestId="" />,
	);
	t.true(lastFrame()?.includes('Debes especificar el ID de la solicitud'));
});

test('MemoryView: muestra error si falta la consulta', t => {
	const {lastFrame} = render(<MemoryView query="" />);
	t.true(lastFrame()?.includes('Falta la consulta de búsqueda'));
});

test('App Component: renderiza vistas correspondientes a cada comando', t => {
	const {lastFrame: loginFrame} = render(
		<App command="login" args={[]} flags={{}} />,
	);
	t.true(loginFrame()?.includes('Por favor, ingresá tu contraseña'));

	const {lastFrame: memoryFrame} = render(
		<App command="memory" args={[]} flags={{}} />,
	);
	t.true(memoryFrame()?.includes('Falta la consulta de búsqueda'));
});

// ---------------------------------------------------------------------------
// jin mode (ADR 0010, Jin_Core #38): interruptor de autonomía del HITL.
// ---------------------------------------------------------------------------

test('parseModeArgs: sin argumentos es estado; alias y horas se interpretan', t => {
	t.deepEqual(parseModeArgs([]), {kind: 'status'});
	t.deepEqual(parseModeArgs(['safe']), {kind: 'change', mode: 'supervised'});
	t.deepEqual(parseModeArgs(['SEMI']), {kind: 'change', mode: 'semi-auto'});
	t.deepEqual(parseModeArgs(['auto', '2']), {
		kind: 'change',
		mode: 'auto',
		hours: 2,
	});
});

test('parseModeArgs: entrada inválida nunca adivina un cambio', t => {
	for (const args of [
		['banana'],
		['auto', 'abc'],
		['auto', '0'],
		['auto', '-3'],
		['auto', '1.5'],
		['auto', '2', 'extra'],
	]) {
		t.deepEqual(
			parseModeArgs(args),
			{kind: 'invalid'},
			`args: ${args.join(' ')}`,
		);
	}
});

test('ModeView: argumentos inválidos muestran el uso y NO llaman a la API', t => {
	const {lastFrame} = render(<ModeView args={['banana']} />);
	t.true(lastFrame()?.includes('Uso: jin mode'));
});

test('App Component: `mode` y la ayuda incluyen el comando', t => {
	const {lastFrame: help} = render(<App command="help" args={[]} flags={{}} />);
	t.true(help()?.includes('jin mode'));

	const {lastFrame: mode} = render(
		<App command="mode" args={['banana']} flags={{}} />,
	);
	t.true(mode()?.includes('Uso: jin mode'));
});

type MockRoute = (
	method: string,
	url: string,
	body: string,
) => {status: number; json: unknown};

async function withMockApi(
	route: MockRoute,
	run: (
		calls: Array<{method: string; url: string; body: string}>,
	) => Promise<void>,
): Promise<void> {
	const calls: Array<{method: string; url: string; body: string}> = [];
	const server = http.createServer((request, response) => {
		let body = '';
		request.on('data', chunk => {
			body += String(chunk);
		});
		request.on('end', () => {
			calls.push({method: request.method ?? '', url: request.url ?? '', body});
			const result = route(request.method ?? '', request.url ?? '', body);
			response.writeHead(result.status, {'content-type': 'application/json'});
			response.end(JSON.stringify(result.json));
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const {port} = server.address() as AddressInfo;
	process.env['JIN_API_URL'] = `http://127.0.0.1:${port}`;
	saveToken('test-token');
	try {
		await run(calls);
	} finally {
		Reflect.deleteProperty(process.env, 'JIN_API_URL');
		await new Promise<void>(resolve => {
			server.close(() => {
				resolve();
			});
		});
	}
}

async function waitForFrame(
	lastFrame: () => string | undefined,
	includes: string,
): Promise<string> {
	for (let index = 0; index < 100; index++) {
		const frame = (lastFrame() ?? '')
			.replaceAll(/[│╭╮╰╯─]/g, ' ')
			.replaceAll(/\s+/g, ' ');
		if (frame.includes(includes)) return frame;
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 20);
		});
	}

	return (lastFrame() ?? '')
		.replaceAll(/[│╭╮╰╯─]/g, ' ')
		.replaceAll(/\s+/g, ' ');
}

const STATUS_BODY = {
	mode: 'semi-auto',
	expiresAt: null,
	remainingSeconds: 5400,
	setBy: 'owner:dual-confirm',
	limits: {
		semiAuto: {defaultHours: 24, maxHours: 72},
		auto: {defaultHours: 4, maxHours: 24},
		maxRelaxedActionsPerHour: 20,
	},
	guardedInSemiAuto: ['sendEmail', 'mergeAgentBranch'],
};

test.serial(
	'ModeView (estado): muestra el modo, el tiempo restante y qué sigue pidiendo aprobación',
	async t => {
		await withMockApi(
			() => ({status: 200, json: STATUS_BODY}),
			async calls => {
				const {lastFrame} = render(<ModeView args={[]} />);
				const frame = await waitForFrame(lastFrame, 'Semiautomático');
				t.true(frame.includes('Semiautomático'));
				t.true(frame.includes('1 h 30 min'));
				t.true(frame.includes('sendEmail'));
				t.is(calls[0]?.method, 'GET');
				t.is(calls[0]?.url, '/api/autonomy');
			},
		);
	},
);

test.serial(
	'ModeView (`auto 2`): NO activa el modo, pide DOBLE aprobación y explica cómo',
	async t => {
		await withMockApi(
			() => ({
				status: 200,
				json: {
					status: 'pending-approval',
					requestId: 'req-mode-1',
					mode: 'auto',
					hours: 2,
				},
			}),
			async calls => {
				const {lastFrame} = render(<ModeView args={['auto', '2']} />);
				const frame = await waitForFrame(lastFrame, 'DOBLE');
				t.true(frame.includes('DOBLE aprobación'));
				t.true(frame.includes('jin approve req-mode-1'));
				t.true(frame.includes('Automático'));
				t.is(calls[0]?.method, 'POST');
				t.deepEqual(JSON.parse(calls[0]?.body ?? '{}'), {
					mode: 'auto',
					hours: 2,
				});
			},
		);
	},
);

test.serial(
	'ModeView (`safe`): vuelve al modo seguro, aplicado al instante',
	async t => {
		await withMockApi(
			() => ({
				status: 200,
				json: {status: 'applied', mode: 'supervised', expiresAt: null},
			}),
			async calls => {
				const {lastFrame} = render(<ModeView args={['safe']} />);
				const frame = await waitForFrame(lastFrame, 'aplicado');
				t.true(frame.includes('Supervisado'));
				t.true(frame.includes('aplicado'));
				t.deepEqual(JSON.parse(calls[0]?.body ?? '{}'), {mode: 'supervised'});
			},
		);
	},
);

test.serial(
	'ModeView: sesión expirada (401) orienta a `jin login`',
	async t => {
		await withMockApi(
			() => ({status: 401, json: {message: 'Unauthorized'}}),
			async () => {
				const {lastFrame} = render(<ModeView args={[]} />);
				const frame = await waitForFrame(lastFrame, 'jin login');
				t.true(frame.includes('jin login'));
			},
		);
	},
);

test.serial(
	'ApproveRejectView: 409 "ya resuelta" (issue #36) NO se confunde con "segunda aprobación demasiado pronto"',
	async t => {
		await withMockApi(
			() => ({
				status: 409,
				json: {
					statusCode: 409,
					code: 'HITL_APPROVAL_ALREADY_RESOLVED',
					message: 'ya resuelta',
				},
			}),
			async () => {
				const {lastFrame} = render(
					<ApproveRejectView action="approve" requestId="req-1" />,
				);
				const frame = await waitForFrame(lastFrame, 'ya está siendo ejecutada');
				t.true(frame.includes('No se ejecuta dos veces'));
				t.false(frame.includes('demasiado pronto'));
			},
		);
	},
);

test.serial(
	'ApproveRejectView: el 409 de la segunda aprobación temprana sigue diciendo "demasiado pronto"',
	async t => {
		await withMockApi(
			() => ({
				status: 409,
				json: {
					statusCode: 409,
					code: 'HITL_SECOND_APPROVAL_TOO_EARLY',
					message: 'muy pronto',
				},
			}),
			async () => {
				const {lastFrame} = render(
					<ApproveRejectView action="approve" requestId="req-2" />,
				);
				const frame = await waitForFrame(lastFrame, 'demasiado pronto');
				t.true(frame.includes('demasiado pronto'));
			},
		);
	},
);
