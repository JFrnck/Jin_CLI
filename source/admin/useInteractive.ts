import {useStdin} from 'ink';

/**
 * ¿Hay un TTY con modo raw? Sin él (pipe, CI, cron) no se pueden leer
 * teclas: las vistas caen a una salida de texto y a los comandos con
 * argumentos (`jin approve <id>`), que siguen sirviendo para scripts.
 */
export function useInteractive(): boolean {
	return useStdin().isRawModeSupported;
}
