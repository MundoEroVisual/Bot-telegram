/**
 * Script para obtener tu ID de Telegram
 * Necesitamos un mensaje tuyo en el canal para extraer tu ID
 */

import axios from 'axios';
import config from './config.js';

const botToken = config.telegram.botToken;
const channels = config.telegram.channels;

if (!botToken || channels.length === 0) {
  console.error('❌ Error: Telegram no está configurado en .env');
  process.exit(1);
}

async function getTelegramUserId() {
  console.log('\n📱 Buscando tu ID de Telegram...\n');
  console.log('Necesito que envíes UN mensaje tuyo al canal:');
  channels.forEach(ch => console.log(`  📍 ${ch}`));
  console.log('\nEspero 10 segundos para verificar...\n');

  await new Promise(r => setTimeout(r, 10000));

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}`;
    
    // Obtener últimas actualizaciones
    const response = await axios.post(`${apiUrl}/getUpdates`, {
      limit: 20,
      timeout: 5,
    });

    if (!response.data.ok || !response.data.result.length) {
      console.error('❌ No se encontraron mensajes. Intenta nuevamente.');
      process.exit(1);
    }

    // Filtrar mensajes recientes del canal
    const channelMessages = response.data.result.filter(update => {
      if (!update.message) return false;
      const msg = update.message;
      return channels.some(ch => {
        if (ch.startsWith('@')) {
          return msg.chat?.username === ch.substring(1);
        }
        return msg.chat?.id?.toString() === ch;
      });
    });

    if (!channelMessages.length) {
      console.error('❌ No encontré mensajes tuyos en los canales configurados.');
      console.error('   Verifica que hayas enviado un mensaje y que el bot pueda ver los mensajes.');
      process.exit(1);
    }

    // Tomar el mensaje más reciente
    const latestMsg = channelMessages[0].message;
    const userId = latestMsg.from?.id;
    const userName = latestMsg.from?.first_name || latestMsg.from?.username || 'Usuario';

    if (!userId) {
      console.error('❌ No se pudo extraer tu ID de usuario.');
      process.exit(1);
    }

    console.log('✅ ¡Encontrado!\n');
    console.log(`📌 Tu ID de Telegram: ${userId}`);
    console.log(`👤 Nombre: ${userName}\n`);
    console.log('Ahora puedes usar el comando de limpieza así:\n');
    console.log(`  node clean-telegram.js @EroverseZone ${userId}\n`);
    console.log('O con los canales del .env:\n');
    console.log(`  node clean-telegram.js ${userId}\n`);

  } catch (err) {
    console.error('❌ Error obteniendo tu ID:', err.message);
    process.exit(1);
  }
}

getTelegramUserId();
