import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

interface ConfirmProps {
	readonly question: string;
	readonly confirmLabel: string;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
}

/**
 * Confirmación explícita antes de una acción irreversible. La opción resaltada
 * por defecto es SIEMPRE «No»: un Enter distraído nunca ejecuta nada.
 */
export function Confirm({
	question,
	confirmLabel,
	onConfirm,
	onCancel,
}: ConfirmProps) {
	return (
		<Box flexDirection="column">
			<Text bold color="yellow">
				{question}
			</Text>
			<SelectInput
				items={[
					{label: 'No, cancelar', value: 'no'},
					{label: confirmLabel, value: 'yes'},
				]}
				onSelect={item => {
					if (item.value === 'yes') onConfirm();
					else onCancel();
				}}
			/>
		</Box>
	);
}
