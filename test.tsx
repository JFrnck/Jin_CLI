import test from 'ava';
import {render} from 'ink-testing-library';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import App from './source/app.js';
import {saveToken, getToken, clearToken} from './source/config/auth-storage.js';
import {LoginView} from './source/components/LoginView.js';
import {ApproveRejectView} from './source/components/ApproveRejectView.js';
import {MemoryView} from './source/components/MemoryView.js';

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
