import createClient from 'openapi-fetch';
import type {paths} from '../api-types.js';
import {getToken} from '../config/auth-storage.js';

export function getBaseUrl(): string {
	return process.env['JIN_API_URL'] || 'http://localhost:3000';
}

export function createApiClient() {
	const baseUrl = getBaseUrl();
	const token = getToken();

	const client = createClient<paths>({
		baseUrl,
		headers: token ? {Authorization: `Bearer ${token}`} : {},
	});

	return client;
}

export const api = createApiClient();
