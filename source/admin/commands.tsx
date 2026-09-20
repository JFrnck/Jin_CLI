import type {ReactElement} from 'react';
import {AuditView} from '../components/AuditView.js';
import {BudgetView} from '../components/BudgetView.js';
import {InboxView} from '../components/InboxView.js';
import {PreviewsView} from '../components/PreviewsView.js';
import {RunsView} from '../components/RunsView.js';

/** Comandos de administración (Fase 9.6). `undefined` si `command` no es uno. */
export function renderAdminCommand(
	command: string,
	args: string[],
	flags: {yes?: boolean | undefined},
): ReactElement | undefined {
	const isConfirmed = Boolean(flags.yes);
	switch (command) {
		case 'inbox': {
			return <InboxView />;
		}

		case 'budget': {
			return <BudgetView args={args} isConfirmed={isConfirmed} />;
		}

		case 'audit': {
			return <AuditView args={args} />;
		}

		case 'previews': {
			return <PreviewsView args={args} isConfirmed={isConfirmed} />;
		}

		case 'runs': {
			return <RunsView args={args} />;
		}

		default: {
			return undefined;
		}
	}
}
