/**
 * Script para limpiar mensajes en Telegram
 * Uso: node clean-telegram.js [canal] [ownerUserId]
 * 
 * Ejemplos:
 *   node clean-telegram.js @EroverseZone 123456789
 *   node clean-telegram.js 123456789 (usa los canales del .env)
 */

import telegramManager from './lib/telegram-manager.js';
import config from './config.js';

let canal = null;
let ownerUserId = null;

// Parsear argumentos
if (process.argv.length < 3) {
  console.error('❌ Error: Faltan argumentos');
  console.error('\nUso:');
  console.error('  node clean-telegram.js <canal> <tuIdDeTelegram>');
  console.error('  node clean-telegram.js <tuIdDeTelegram> (usa canales del .env)');
  console.error('\nEjemplos:');
  console.error('  node clean-telegram.js @EroverseZone 123456789');
  console.error('  node clean-telegram.js 123456789');
  console.error('\n¿Cómo obtener tu ID de Telegram?');
  console.error('  1. Abre @userinfobot en Telegram');
  console.error('  2. Envía /start');
  console.error('  3. Te mostrará tu ID de usuario');
  process.exit(1);
}

// Lógica de parseo de argumentos
const arg1 = process.argv[2];
const arg2 = process.argv[3];

if (arg1.startsWith('@')) {
  // Primer argumento es un canal
  canal = arg1;
  ownerUserId = arg2;
} else {
  // Primer argumento es un ID
  ownerUserId = arg1;
}

// Validar ownerUserId
if (!ownerUserId || isNaN(ownerUserId)) {
  console.error('❌ Error: ID de Telegram inválido');
  process.exit(1);
}

// Si se proporciona canal, cambiar temporalmente el config
if (canal) {
  console.log(`\n🎯 Limpiando canal específico: ${canal}`);
  telegramManager.channels = [canal];
} else {
  console.log(`\n🎯 Limpiando canales del .env: ${config.telegram.channels.join(', ')}`);
}

console.log(`📍 ID del propietario: ${ownerUserId}`);
console.log(`\nEsto eliminará TODOS los mensajes excepto:
  ✅ Mensajes enviados por el bot
  ✅ Tus mensajes (ID: ${ownerUserId})
\n⚠️ ¿Estás seguro? Escribe 's' para continuar:\n`);

// Leer confirmación desde stdin
process.stdin.once('data', async (data) => {
  const respuesta = data.toString().trim().toLowerCase();
  
  if (respuesta === 's' || respuesta === 'si' || respuesta === 'sí') {
    try {
      const eliminados = await telegramManager.clearNonBotNonOwnerMessages(parseInt(ownerUserId));
      console.log(`\n✨ Limpieza completada: ${eliminados} mensajes eliminados`);
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Error durante la limpieza: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('❌ Operación cancelada');
    process.exit(0);
  }
});
