import cron from 'node-cron';
import HotzoneScraper from './lib/hotzone-scraper.js';
import NovelaManager from './lib/novela-manager.js';
import telegramManager from './lib/telegram-manager.js';
import config from './config.js';
import fs from 'fs-extra';
import path from 'path';

const manager = new NovelaManager();
let scraper = new HotzoneScraper();
let isRunning = false;

async function buscarNovelas() {
  if (isRunning) {
    console.log('⚠️ Una búsqueda ya está en curso. Saltando ejecución...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('🤖 [BOT] Iniciando búsqueda automática de novelas...');
  console.log(`⏰ ${new Date().toLocaleString()}`);
  console.log('='.repeat(60));

  try {
    // Validar credenciales
    if (!config.hotzone.username || !config.hotzone.password) {
      console.error('❌ ERROR: Credenciales no configuradas.');
      console.error('   Por favor, crea un archivo .env basado en .env.example');
      console.error('   y configura HOTZONE_USER y HOTZONE_PASS');
      throw new Error('Credenciales faltantes');
    }

    // Iniciar sesión
    console.log('\n📍 Paso 1: Iniciando sesión en HotZone18...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      throw new Error('No se pudo iniciar sesión. Verifica tus credenciales y la estructura del sitio.');
    }

    // Obtener novelas
    console.log('\n📍 Paso 2: Extrayendo novelas recientes...');
    const novelas = await scraper.getLatestNovelas();
    if (novelas.length === 0) {
      console.warn('⚠️ No se encontraron novelas.');
      return;
    }

    console.log(`\n📌 Se encontraron ${novelas.length} novelas`);
    novelas.forEach((n, i) => {
      const tieneEnlace = n.android_vip || n.android;
      const enlaceInfo = n.android_vip ? '✅ VIP' : (n.android ? '✅ Mediafire' : '❌ No disponible');
      console.log(`  ${i + 1}. ${n.titulo}`);
      console.log(`     📥 Enlace: ${enlaceInfo}`);
      console.log(`     📋 Estado: ${n.estado || 'Desconocido'}`);
    });

    // Guardar novelas
    console.log('\n📍 Paso 3: Guardando novelas en base de datos...');
    const novelasActualizadas = await manager.addNovelas(novelas);

    // Crear archivos de detalles
    console.log('\n📍 Paso 4: Creando archivos de detalles...');
    for (const novela of novelas) {
      await manager.createDetailFile(novela);
    }

    // Mostrar estadísticas
    console.log('\n📍 Paso 5: Estadísticas actualizadas...');
    const stats = await manager.getStats();
    console.log(`  Total de novelas: ${stats.total}`);
    console.log(`  Con enlace directo: ${stats.conEnlace}/${stats.total}`);
    console.log(`  Con portada: ${stats.conPortada}/${stats.total}`);

    // Cerrar navegador
    await scraper.close();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Búsqueda completada en ${elapsed}s`);
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error('\n❌ Error durante búsqueda:', err.message);
    console.error(err.stack);
  } finally {
    isRunning = false;
    // Reiniciar scraper para siguiente ejecución
    try {
      await scraper.close();
    } catch (e) {
      // Ignorar errores al cerrar
    }
    scraper = new HotzoneScraper();
  }
}

async function mostrarStatus() {
  try {
    const stats = await manager.getStats();
    console.log('\n📊 STATUS DEL BOT');
    console.log('='.repeat(40));
    console.log(`Total de novelas: ${stats.total}`);
    console.log(`Con enlace directo: ${stats.conEnlace}/${stats.total}`);
    console.log(`Ubicación datos: ${config.paths.novelasJson}`);
    console.log('='.repeat(40));
    if (stats.ultimas.length > 0) {
      console.log('\n🆕 Últimas novelas agregadas:');
      stats.ultimas.forEach(n => {
        console.log(`  - ${n.titulo}`);
      });
    }
  } catch (err) {
    console.error('Error mostrando status:', err.message);
  }
}

async function main() {
  console.log('🚀 Iniciando Harvis Bot VIP...');
  console.log(`📍 Configuración:`);
  console.log(`   - Usuario: ${config.hotzone.username ? '✅ Configurado' : '❌ NO configurado'}`);
  console.log(`   - GitHub: ${config.github.enabled ? '✅ Habilitado' : '❌ Deshabilitado'}`);
  console.log(`   - Schedule: ${config.cron.schedule}`);
  console.log(`   - Debug: ${config.debug ? '✅' : '❌'}\n`);

  // Ejecutar inmediatamente al inicio
  if (process.argv.includes('--now')) {
    await buscarNovelas();
  }

  // Agendar búsqueda automática
  if (config.cron.enabled) {
    console.log(`⏱️ Agendando búsqueda automática: "${config.cron.schedule}"`);
    cron.schedule(config.cron.schedule, buscarNovelas);
    console.log('✅ Bot en modo automático. Esperando próxima ejecución...\n');
  }

  // Mostrar status cada 30 minutos
  setInterval(mostrarStatus, 30 * 60 * 1000);

  // Limpiar mensajes de "joined the group" cada 5 minutos
  if (config.telegram.enabled) {
    console.log('🧹 Limpieza automática de mensajes de Telegram habilitada (cada 5 minutos)');
    setInterval(async () => {
      await telegramManager.cleanJoinedMessages();
    }, 5 * 60 * 1000); // Cada 5 minutos en lugar de 10
  }

  // Mostrar status inicial
  await mostrarStatus();

  // Mantener el bot corriendo
  console.log('\n💡 Comandos disponibles:');
  console.log('   - Presiona Ctrl+C para detener el bot');
  console.log('   - Usa: npm start -- --now  para ejecutar inmediatamente\n');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGINT', async () => {
  console.log('\n\n👋 Deteniendo bot...');
  try {
    await scraper.close();
  } catch (e) {}
  process.exit(0);
});
