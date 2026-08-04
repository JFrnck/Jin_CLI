import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR_NAME = 'jin';
const CONFIG_FILE_NAME = 'auth.json';

export function getAuthDir(): string {
	const customPath = process.env['JIN_CONFIG_DIR'];
	if (customPath) return customPath;
	const configHome =
		process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
	return path.join(configHome, CONFIG_DIR_NAME);
}

export function getAuthPath(): string {
	return path.join(getAuthDir(), CONFIG_FILE_NAME);
}

export interface AuthConfig {
	accessToken?: string;
	savedAt?: string;
}

export function saveToken(token: string): string {
	const authDir = getAuthDir();
	if (!fs.existsSync(authDir)) {
		fs.mkdirSync(authDir, {recursive: true, mode: 0o700});
	}

	const filePath = getAuthPath();
	const data: AuthConfig = {
		accessToken: token,
		savedAt: new Date().toISOString(),
	};

	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
		encoding: 'utf8',
		mode: 0o600,
	});

	// Asegurar permisos 0600 explícitamente en sistemas POSIX
	try {
		fs.chmodSync(filePath, 0o600);
	} catch {
		// En Windows chmodSync puede fallar o no ser soportado
	}

	return filePath;
}

export function getToken(): string | undefined {
	const filePath = getAuthPath();
	if (!fs.existsSync(filePath)) return undefined;

	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const parsed = JSON.parse(raw) as AuthConfig;
		return parsed.accessToken;
	} catch {
		return undefined;
	}
}

export function clearToken(): void {
	const filePath = getAuthPath();
	if (fs.existsSync(filePath)) {
		try {
			fs.unlinkSync(filePath);
		} catch {
			// Ignorar si no se pudo eliminar
		}
	}
}
