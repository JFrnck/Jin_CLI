import test from 'ava';
import {Box} from 'ink';
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
import {InboxView} from './source/components/InboxView.js';
import {BudgetView} from './source/components/BudgetView.js';
import {AuditView} from './source/components/AuditView.js';
import {PreviewsView} from './source/components/PreviewsView.js';
import {RunsView} from './source/components/RunsView.js';
import {
	parseAuditArgs,
	parseBudgetArgs,
	parsePreviewsArgs,
	parseRunsArgs,
} from './source/admin/args.js';
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

// ---------------------------------------------------------------------------
// Fase 9.6: menús navegables y comandos de administración.
// ---------------------------------------------------------------------------

// ink-testing-library 3 no implementa `stdin.ref()`/`unref()`, que Ink 4.4
// llama al activar el modo raw (useInput/SelectInput): sin esto cualquier vista
// con teclas revienta al montarse. Se parchea la clase de su stdin de prueba.
const probe = render(<Box />);
const stdinPrototype = Object.getPrototypeOf(probe.stdin) as Record<
	string,
	unknown
>;
stdinPrototype['ref'] ??= () => undefined;
stdinPrototype['unref'] ??= () => undefined;
// Ink 4.4 lee las teclas con `stdin.read()` tras un evento 'readable' (no con
// 'data', que es lo único que emite el `stdin.write` de la librería).
stdinPrototype['read'] = function (this: {queue?: string[]}) {
	return this.queue?.shift() ?? null;
};

probe.unmount();

const DOWN = '\u001B[B';
const ENTER = '\r';

/** Como `waitForFrame`, pero FALLA si el texto nunca aparece (evita tests vacuos). */
async function expectFrame(
	t: {true: (value: boolean, message?: string) => void},
	lastFrame: () => string | undefined,
	includes: string,
): Promise<string> {
	const frame = await waitForFrame(lastFrame, includes);
	t.true(frame.includes(includes), `no apareció «${includes}»: ${frame}`);
	return frame;
}

async function press(
	stdin: {emit: (event: string) => boolean},
	...keys: string[]
): Promise<void> {
	const fake = stdin as unknown as {
		queue?: string[];
		emit: (e: string) => void;
	};
	for (const key of keys) {
		// Ink registra el listener de teclas en un efecto: hay que dejarlo montar.
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 40);
		});
		fake.queue ??= [];
		fake.queue.push(key);
		fake.emit('readable');
	}
}

function pending(id: string, extra: Record<string, unknown> = {}) {
	return {
		requestId: id,
		toolName: 'sendEmail',
		level: 'confirm',
		inputsHash: 'h',
		planSummary: `Enviar correo ${id}`,
		payload: {},
		actor: 'agent',
		externalInputsSummary: null,
		createdAt: '2026-09-20T10:00:00.000Z',
		firstApprovedAt: null,
		firstApprover: null,
		availableAt: null,
		escalatedAt: null,
		executingAt: null,
		executionError: null,
		...extra,
	};
}

test('args: budget/audit/previews/runs interpretan y rechazan entradas inválidas', t => {
	t.deepEqual(parseBudgetArgs([]), {kind: 'status'});
	t.deepEqual(parseBudgetArgs(['UNPAUSE']), {kind: 'unpause'});
	t.deepEqual(parseBudgetArgs(['x']), {kind: 'invalid'});
	t.deepEqual(parseAuditArgs([]), {kind: 'list', limit: 20});
	t.deepEqual(parseAuditArgs(['50']), {kind: 'list', limit: 50});
	for (const bad of [['0'], ['201'], ['-1'], ['1.5'], ['a'], ['1', '2']]) {
		t.deepEqual(
			parseAuditArgs(bad),
			{kind: 'invalid'},
			`args: ${bad.join(' ')}`,
		);
	}

	t.deepEqual(parsePreviewsArgs([]), {kind: 'list'});
	t.deepEqual(parsePreviewsArgs(['stop']), {kind: 'stop'});
	t.deepEqual(parsePreviewsArgs(['stop', 'p1']), {
		kind: 'stop',
		serviceId: 'p1',
	});
	t.deepEqual(parsePreviewsArgs(['x']), {kind: 'invalid'});
	t.deepEqual(parseRunsArgs([]), {kind: 'list'});
	t.deepEqual(parseRunsArgs(['r1']), {kind: 'detail', runId: 'r1'});
	t.deepEqual(parseRunsArgs(['a', 'b']), {kind: 'invalid'});
});

test('App: la ayuda lista los comandos de administración', t => {
	const {lastFrame} = render(<App command="help" args={[]} flags={{}} />);
	for (const command of [
		'jin inbox',
		'jin budget',
		'jin audit',
		'jin previews',
		'jin runs',
	]) {
		t.true(lastFrame()?.includes(command), `falta ${command}`);
	}
});

test.serial(
	'InboxView: navegar con flechas y aprobar SIN escribir un requestId',
	async t => {
		await withMockApi(
			(method, url) => {
				if (method === 'GET' && url === '/api/hitl/pending') {
					return {status: 200, json: [pending('req-a'), pending('req-b')]};
				}

				if (method === 'POST' && url === '/api/hitl/req-b/approve') {
					return {
						status: 200,
						json: {
							outcome: 'resolved',
							toolName: 'sendEmail',
							result: 'enviado',
						},
					};
				}

				return {status: 404, json: {}};
			},
			async calls => {
				const {stdin, lastFrame} = render(<InboxView />);
				await expectFrame(t, lastFrame, 'Aprobaciones pendientes (2)');

				// Segundo ítem -> Enter (detalle) -> Aprobar -> Enter -> «Sí» -> Enter.
				await press(stdin, DOWN, ENTER);
				await expectFrame(t, lastFrame, 'Enviar correo req-b');
				await press(stdin, DOWN, ENTER);
				await expectFrame(t, lastFrame, '¿Aprobar y EJECUTAR sendEmail?');
				t.false(calls.some(call => call.method === 'POST'));
				await press(stdin, DOWN, ENTER);
				const frame = await expectFrame(t, lastFrame, 'ejecutada exitosamente');

				t.true(frame.includes('enviado'));
				const posts = calls.filter(call => call.method === 'POST');
				t.is(posts.length, 1);
				t.is(posts[0]?.url, '/api/hitl/req-b/approve');
			},
		);
	},
);

test.serial(
	'InboxView: un Enter por reflejo NUNCA aprueba (Volver y «No» son lo resaltado por defecto)',
	async t => {
		await withMockApi(
			() => ({status: 200, json: [pending('req-a')]}),
			async calls => {
				const {stdin, lastFrame} = render(<InboxView />);
				await expectFrame(t, lastFrame, 'Aprobaciones pendientes (1)');

				// Enter -> detalle; Enter -> «Volver» (por defecto): regresa a la lista.
				await press(stdin, ENTER, ENTER);
				await expectFrame(t, lastFrame, 'Aprobaciones pendientes (1)');

				// Detalle -> Aprobar -> confirmación; Enter sobre «No» -> cancela.
				await press(stdin, ENTER, DOWN, ENTER);
				await expectFrame(t, lastFrame, '¿Aprobar y EJECUTAR sendEmail?');
				await press(stdin, ENTER);
				await expectFrame(t, lastFrame, 'Volver');

				t.false(calls.some(call => call.method === 'POST'));
			},
		);
	},
);

test.serial('InboxView: rechazar desde el menú llama a /reject', async t => {
	await withMockApi(
		(method, url) => {
			if (method === 'GET') return {status: 200, json: [pending('req-a')]};
			if (url === '/api/hitl/req-a/reject')
				return {status: 200, json: {ok: true}};
			return {status: 404, json: {}};
		},
		async calls => {
			const {stdin, lastFrame} = render(<InboxView />);
			await expectFrame(t, lastFrame, 'Aprobaciones pendientes (1)');
			await press(stdin, ENTER, DOWN, DOWN, ENTER);
			await expectFrame(t, lastFrame, '¿Rechazar sendEmail?');
			await press(stdin, DOWN, ENTER);
			const frame = await expectFrame(t, lastFrame, 'rechazada correctamente');
			t.true(frame.includes('rechazada correctamente'));
			t.is(calls.filter(call => call.method === 'POST').length, 1);
		},
	);
});

test.serial(
	'InboxView: el 409 «ya resuelta» se dice como tal (otra superficie se adelantó)',
	async t => {
		await withMockApi(
			method =>
				method === 'GET'
					? {status: 200, json: [pending('req-a')]}
					: {
							status: 409,
							json: {statusCode: 409, code: 'HITL_APPROVAL_ALREADY_RESOLVED'},
					  },
			async () => {
				const {stdin, lastFrame} = render(<InboxView />);
				await expectFrame(t, lastFrame, 'Aprobaciones pendientes (1)');
				await press(stdin, ENTER, DOWN, ENTER);
				await expectFrame(t, lastFrame, '¿Aprobar y EJECUTAR');
				await press(stdin, DOWN, ENTER);
				const frame = await expectFrame(
					t,
					lastFrame,
					'No se ejecuta dos veces',
				);
				t.true(frame.includes('ya está siendo ejecutada'));
			},
		);
	},
);

test.serial(
	'InboxView: dual-confirm muestra la 1ª aprobación y la espera',
	async t => {
		await withMockApi(
			() => ({
				status: 200,
				json: [
					pending('req-d', {
						level: 'dual-confirm',
						firstApprovedAt: '2026-09-20T10:00:00.000Z',
						firstApprover: 'owner',
						availableAt: new Date(Date.now() + 20_000).toISOString(),
						executionError: 'gmail 503',
					}),
				],
			}),
			async () => {
				const {stdin, lastFrame} = render(<InboxView />);
				const list = await expectFrame(t, lastFrame, '1/2 aprobada');
				t.true(list.includes('1/2 aprobada'));
				await press(stdin, ENTER);
				const detail = await waitForFrame(
					lastFrame,
					'1ª aprobación registrada',
				);
				t.true(detail.includes('La 2ª estará disponible en'));
				t.true(detail.includes('NO se ejecutó: gmail 503'));
			},
		);
	},
);

test.serial('InboxView: bandeja vacía y sesión expirada', async t => {
	await withMockApi(
		() => ({status: 200, json: []}),
		async () => {
			const {lastFrame} = render(<InboxView />);
			const frame = await expectFrame(t, lastFrame, 'No hay aprobaciones');
			t.true(frame.includes('No hay aprobaciones pendientes'));
		},
	);
	await withMockApi(
		() => ({status: 401, json: {}}),
		async () => {
			const {lastFrame} = render(<InboxView />);
			const frame = await expectFrame(t, lastFrame, 'jin login');
			t.true(frame.includes('jin login'));
		},
	);
});

const BUDGET = (active: boolean) => ({
	dailyUsageRatio: 0.42,
	dailyUsageUsd: 4.2,
	dailyUsageTokens: 1000,
	dailyLimitUsd: 10,
	dailyLimitTokens: 5000,
	killSwitchActive: active,
	killSwitch: {
		activatedAt: active ? '2026-09-20T09:00:00.000Z' : null,
		reason: active ? 'runaway' : null,
		currentHourTokens: 900,
		avgHourlyTokens: 100,
	},
});

test.serial('BudgetView: muestra el presupuesto y el kill switch', async t => {
	await withMockApi(
		() => ({status: 200, json: BUDGET(true)}),
		async () => {
			const {lastFrame} = render(<BudgetView args={[]} />);
			const frame = await expectFrame(t, lastFrame, 'KILL SWITCH ACTIVO');
			t.true(frame.includes('$4.20 / $10.00'));
			t.true(frame.includes('runaway'));
		},
	);
});

test.serial(
	'BudgetView unpause: pide confirmación y NO reactiva hasta confirmarla',
	async t => {
		let active = true;
		await withMockApi(
			(method, url) => {
				if (method === 'POST' && url === '/api/budget/unpause') {
					active = false;
					return {status: 200, json: {ok: true}};
				}

				return {status: 200, json: BUDGET(active)};
			},
			async calls => {
				const {stdin, lastFrame} = render(<BudgetView args={['unpause']} />);
				await expectFrame(t, lastFrame, '¿Reactivar el agente?');
				// Enter sobre «No»: cancela sin llamar a la API.
				await press(stdin, ENTER);
				await expectFrame(t, lastFrame, 'Cancelado');
				t.false(calls.some(call => call.method === 'POST'));
			},
		);

		active = true;
		await withMockApi(
			(method, url) => {
				if (method === 'POST' && url === '/api/budget/unpause') {
					active = false;
					return {status: 200, json: {ok: true}};
				}

				return {status: 200, json: BUDGET(active)};
			},
			async calls => {
				const {stdin, lastFrame} = render(<BudgetView args={['unpause']} />);
				await expectFrame(t, lastFrame, '¿Reactivar el agente?');
				await press(stdin, DOWN, ENTER);
				const frame = await expectFrame(t, lastFrame, 'Agente reactivado');
				t.true(frame.includes('Agente reactivado'));
				t.is(calls.filter(call => call.method === 'POST').length, 1);
			},
		);
	},
);

test.serial(
	'BudgetView unpause --yes: reactiva sin confirmación, una sola vez',
	async t => {
		let active = true;
		await withMockApi(
			(method, url) => {
				if (method === 'POST' && url === '/api/budget/unpause') {
					active = false;
					return {status: 200, json: {ok: true}};
				}

				return {status: 200, json: BUDGET(active)};
			},
			async calls => {
				const {lastFrame} = render(
					<BudgetView isConfirmed args={['unpause']} />,
				);
				await expectFrame(t, lastFrame, 'Agente reactivado');
				t.is(calls.filter(call => call.method === 'POST').length, 1);
			},
		);
	},
);

test.serial(
	'BudgetView unpause: si no hay kill switch no hay nada que reactivar',
	async t => {
		await withMockApi(
			() => ({status: 200, json: BUDGET(false)}),
			async calls => {
				const {lastFrame} = render(
					<BudgetView isConfirmed args={['unpause']} />,
				);
				const frame = await expectFrame(t, lastFrame, 'nada que reactivar');
				t.true(frame.includes('nada que reactivar'));
				t.false(calls.some(call => call.method === 'POST'));
			},
		);
	},
);

function auditItem(id: string, tool: string) {
	return {
		id,
		requestId: `r-${id}`,
		timestamp: '2026-09-20T10:00:00.000Z',
		actor: 'agent',
		actionType: 'tool_call',
		toolName: tool,
		inputsHash: 'h',
		planSummary: `plan ${id}`,
		approvalStatus: 'auto',
		approver: null,
		externalInputsSummary: null,
		prevHash: 'p',
		currentHash: 'c',
	};
}

test.serial('AuditView: lista y pagina con el cursor (n / b)', async t => {
	await withMockApi(
		(_method, url) =>
			url.includes('cursor=c1')
				? {
						status: 200,
						json: {items: [auditItem('2', 'readFile')], nextCursor: null},
				  }
				: {
						status: 200,
						json: {items: [auditItem('1', 'sendEmail')], nextCursor: 'c1'},
				  },
		async calls => {
			const {stdin, lastFrame} = render(<AuditView args={['5']} />);
			await expectFrame(t, lastFrame, 'sendEmail');
			t.true(calls[0]?.url.includes('limit=5'));
			await press(stdin, 'n');
			const second = await expectFrame(t, lastFrame, 'readFile');
			t.true(second.includes('página 2'));
			await press(stdin, 'b');
			await expectFrame(t, lastFrame, 'sendEmail');
		},
	);
});

test('AuditView: cantidad inválida muestra el uso', t => {
	const {lastFrame} = render(<AuditView args={['999']} />);
	t.true(lastFrame()?.includes('Uso: jin audit'));
});

const PREVIEW = {
	id: 'p1',
	slug: 'demo',
	url: 'https://demo.example',
	status: 'running',
	expiresAt: '2026-09-21T10:00:00.000Z',
};

test.serial('PreviewsView: lista los previews', async t => {
	await withMockApi(
		() => ({status: 200, json: [PREVIEW]}),
		async () => {
			const {lastFrame} = render(<PreviewsView args={[]} />);
			const frame = await expectFrame(t, lastFrame, 'https://demo.example');
			t.true(frame.includes('Previews (1)'));
		},
	);
});

test.serial('PreviewsView stop <id>: confirma antes de detener', async t => {
	await withMockApi(
		method =>
			method === 'DELETE'
				? {status: 200, json: {ok: true}}
				: {status: 200, json: [PREVIEW]},
		async calls => {
			const {stdin, lastFrame} = render(<PreviewsView args={['stop', 'p1']} />);
			await expectFrame(t, lastFrame, '¿Detener el preview "p1"?');
			await press(stdin, ENTER); // «No»
			await expectFrame(t, lastFrame, 'Cancelado');
			t.false(calls.some(call => call.method === 'DELETE'));
		},
	);
	await withMockApi(
		method =>
			method === 'DELETE'
				? {status: 200, json: {ok: true}}
				: {status: 200, json: [PREVIEW]},
		async calls => {
			const {stdin, lastFrame} = render(<PreviewsView args={['stop', 'p1']} />);
			await expectFrame(t, lastFrame, '¿Detener el preview "p1"?');
			await press(stdin, DOWN, ENTER);
			await expectFrame(t, lastFrame, 'detenido');
			t.is(
				calls.find(call => call.method === 'DELETE')?.url,
				'/api/preview-services/p1',
			);
		},
	);
});

test.serial(
	'PreviewsView stop <id> --yes: detiene sin confirmación',
	async t => {
		await withMockApi(
			method =>
				method === 'DELETE'
					? {status: 200, json: {ok: true}}
					: {status: 200, json: [PREVIEW]},
			async calls => {
				const {lastFrame} = render(
					<PreviewsView isConfirmed args={['stop', 'p1']} />,
				);
				await expectFrame(t, lastFrame, 'detenido');
				t.is(calls.filter(call => call.method === 'DELETE').length, 1);
			},
		);
	},
);

const RUN = {
	id: 'run-1',
	objective: 'Migrar el módulo de pagos',
	status: 'done',
	parentSessionId: 's1',
	finalResponse: 'Listo',
	createdAt: '2026-09-20T10:00:00.000Z',
	completedAt: '2026-09-20T10:30:00.000Z',
};

test.serial(
	'RunsView: lista, Enter abre los tickets de la ejecución',
	async t => {
		await withMockApi(
			(_method, url) =>
				url.startsWith('/api/orchestrator/runs/run-1')
					? {
							status: 200,
							json: {
								run: RUN,
								tickets: [
									{
										id: 't1',
										runId: 'run-1',
										description: 'Escribir migración',
										status: 'done',
										assignedSubAgentId: null,
										allowedTools: [],
										dependsOn: [],
										result: 'ok',
										comments: [],
									},
								],
							},
					  }
					: {status: 200, json: {items: [RUN], nextCursor: null}},
			async () => {
				const {stdin, lastFrame} = render(<RunsView args={[]} />);
				await expectFrame(t, lastFrame, 'Migrar el módulo de pagos');
				await press(stdin, ENTER);
				const frame = await expectFrame(t, lastFrame, 'Escribir migración');
				t.true(frame.includes('Tickets (1)'));
			},
		);
	},
);
