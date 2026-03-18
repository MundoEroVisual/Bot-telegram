/**
 * Listener de comandos en Telegram
 * El bot escucha comandos como /clean y los ejecuta
 * 
 * Uso:
 *   node telegram-commands.js
 * 
 * Comandos disponibles:
 *   /clean - Elimina todos los mensajes del sistema del canal
 *   /clean @canal - Elimina los mensajes del sistema de un canal específico
 *   /stop - Detiene el listener
 */

import axios from 'axios';
import config from './config.js';
import telegramManager from './lib/telegram-manager.js';

const botToken = config.telegram.botToken;
const ownerUserId = config.owner?.telegramUserId; // Asume que hay un user_id en config

if (!botToken) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN no está configurado en .env');
  process.exit(1);
}

if (!ownerUserId) {
  console.error('❌ Error: Owner Telegram ID no está configurado');
  console.error('Debes agregar a config.js:');
  console.error('  owner: { telegramUserId: 123456789 }');
  process.exit(1);
}

const apiUrl = `https://api.telegram.org/bot${botToken}`;
let lastUpdateId = 0;
let isRunning = true;

console.log(`
╔════════════════════════════════════════════════════╗
║    🤖 TELEGRAM COMMAND LISTENER - ACTIVO           ║
╠════════════════════════════════════════════════════╣
║  Escuchando comandos en: ${config.telegram.channels.join(', ')}
║  Owner ID: ${ownerUserId}
║                                                    ║
║  Comandos disponibles:                             ║
║  /clean         - Limpia el canal                  ║
║  /clean @canal  - Limpia un canal específico       ║
║  /stop          - Detiene este script              ║
╚════════════════════════════════════════════════════╝
`);

async function getUpdates() {
  try {
    const response = await axios.post(`${apiUrl}/getUpdates`, {
      offset: lastUpdateId + 1,
      limit: 10,
      timeout: 30,
    }, {
      timeout: 35000,
    });

    if (!response.data.ok) {
      console.error('❌ Error en getUpdates:', response.data.description);
      return [];
    }

    return response.data.result || [];
  } catch (err) {
    console.error('❌ Error obteniendo updates:', err.message);
    return [];
  }
}

async function sendMessage(chatId, text, parseMode = 'HTML') {
  try {
    await axios.post(`${apiUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err.message);
  }
}

async function handleCommand(msg, command, args) {
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  const username = msg.from?.first_name || msg.from?.username || 'Usuario';

  // Validar que sea el propietario
  if (userId !== ownerUserId) {
    console.log(`❌ Acceso denegado: ${username} (ID: ${userId}) intentó usar comando`);
    await sendMessage(chatId, '❌ No tienes permisos para usar este comando.');
    return;
  }

  if (command === 'clean') {
    console.log(`\n🧹 ${username} inició limpieza...`);
    await sendMessage(chatId, '⏳ <i>Limpiando mensajes del sistema...</i>');

    // Cambiar temporalmente el canal si se especificó uno
    let channelsAnteriores = null;
    if (args.length > 0) {
      const canalEspecifico = args[0];
      if (canalEspecifico.startsWith('@')) {
        channelsAnteriores = telegramManager.channels;
        telegramManager.channels = [canalEspecifico];
        console.log(`   📍 Canal específico: ${canalEspecifico}`);
      }
    }

    try {
      const eliminados = await telegramManager.clearNonBotNonOwnerMessages(userId);
      
      // Restaurar canales anteriores si se cambió
      if (channelsAnteriores) {
        telegramManager.channels = channelsAnteriores;
      }

      const mensaje = `✅ <b>Limpieza completada</b>\n${eliminados} mensaje(s) del sistema eliminados`;
      await sendMessage(chatId, mensaje);
      console.log(`   ✅ ${mensaje}`);
    } catch (err) {
      console.error('❌ Error durante limpieza:', err.message);
      await sendMessage(chatId, `❌ Error durante la limpieza: ${err.message}`);
    }
  } else if (command === 'stop') {
    console.log(`\n🛑 ${username} detuvo el listener`);
    await sendMessage(chatId, '🛑 Listener detenido');
    isRunning = false;
    process.exit(0);
  } else if (command === 'help') {
    const help = `
<b>📱 Comandos disponibles:</b>

<code>/clean</code> - Limpia todos los canales
<code>/clean @canal</code> - Limpia un canal específico
<code>/help</code> - Muestra esta ayuda
<code>/stop</code> - Detiene el listener

<i>Solo el propietario puede usar estos comandos</i>
    `.trim();
    await sendMessage(chatId, help);
  }
}

async function processUpdates() {
  const updates = await getUpdates();

  for (const update of updates) {
    lastUpdateId = update.update_id;

    if (!update.message) continue;

    const msg = update.message;
    const text = msg.text || '';
    const username = msg.from?.first_name || msg.from?.username || 'Usuario';
    const chatId = msg.chat?.id;

    // Detectar comandos
    if (text.startsWith('/')) {
      const partes = text.split(' ');
      const command = partes[0].substring(1).toLowerCase(); // Remover /
      const args = partes.slice(1);

      console.log(`\n📨 Comando recibido de ${username}: /${command} ${args.join(' ')}`);

      await handleCommand(msg, command, args);
    }
  }
}

async function startListener() {
  console.log('✅ Listener iniciado, esperando comandos...\n');

  while (isRunning) {
    try {
      await processUpdates();
      // Pequeña pausa para no saturar la API
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error('❌ Error en main loop:', err.message);
      await new Promise(r => setTimeout(r, 5000)); // Esperar 5s antes de reintentar
    }
  }
}

// Manejo de señales para salida limpia
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo listener...');
  isRunning = false;
  process.exit(0);
});

startListener();
