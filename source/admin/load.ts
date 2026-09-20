import {useEffect, useState} from 'react';
import {UNAUTHENTICATED} from '../hitl-actions.js';

export class ApiError extends Error {}

export type Loaded<T> =
	| {readonly status: 'loading'}
	| {readonly status: 'error'; readonly message: string}
	| {readonly status: 'ok'; readonly data: T};

/** Convierte un resultado de openapi-fetch en el dato o un `ApiError` legible. */
export function unwrap<T>(
	result: {data?: T; error?: unknown; response: Response},
	what: string,
): T {
	if (result.error !== undefined || result.data === undefined) {
		const {status} = result.response;
		throw new ApiError(
			status === 401 ? UNAUTHENTICATED : `Error al ${what} (HTTP ${status}).`,
		);
	}

	return result.data;
}

export function describeError(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	const message = error instanceof Error ? error.message : String(error);
	return `Error de comunicación con Jin Core: ${message}`;
}

/** Carga async con estados loading/error/ok; `reloadKey` distinto vuelve a cargar. */
export function useLoad<T>(
	fetcher: () => Promise<T>,
	reloadKey = 0,
): Loaded<T> {
	const [state, setState] = useState<Loaded<T>>({status: 'loading'});

	useEffect(() => {
		let cancelled = false;
		setState({status: 'loading'});
		fetcher()
			.then(data => {
				if (!cancelled) setState({status: 'ok', data});
			})
			.catch((error: unknown) => {
				if (!cancelled)
					setState({status: 'error', message: describeError(error)});
			});
		return () => {
			cancelled = true;
		};
		// `fetcher` es una closure nueva en cada render: solo `reloadKey` recarga.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reloadKey]);

	return state;
}
