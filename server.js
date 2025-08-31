

import express from 'express';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint básico para ping
app.get('/', (req, res) => res.send('Servidor en funcionamiento ✅'));

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

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    ejecutarBotPeriodico('node', ['bot-telegram.js'], 5 * 60 * 1000);
    setInterval(() => {
        fetch(`http://localhost:${PORT}/`).catch(() => {});
    }, 3 * 60 * 1000);
});
