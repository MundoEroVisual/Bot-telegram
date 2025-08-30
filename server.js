
import { spawn } from 'child_process';

// Ejecutar el bot de Telegram cada 5 minutos
function ejecutarBotPeriodico(comando, args = [], intervaloMs) {
    const ejecutar = () => {
        console.log(`🚀 Ejecutando bot-telegrams.js...`);
        const proceso = spawn(comando, args, { stdio: 'inherit' });
        proceso.on('close', (code) => {
            console.log(`[Bot Telegram] proceso cerrado con código: ${code}`);
        });
        proceso.on('error', (err) => {
            console.error(`[Bot Telegram ERROR]`, err);
        });
    };
    ejecutar();
    setInterval(ejecutar, intervaloMs);
}

ejecutarBotPeriodico('node', ['bot-telegram.js'], 5 * 60 * 1000);
