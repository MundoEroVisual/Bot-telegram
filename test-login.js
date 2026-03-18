import HotzoneScraper from './lib/hotzone-scraper.js';
import config from './config.js';

async function testLogin() {
  console.log('🧪 Prueba de conexión y login en HotZone18');
  console.log('='.repeat(50));
  console.log(`Usuario: ${config.hotzone.username}`);
  console.log(`URL: ${config.hotzone.baseUrl}`);
  console.log('='.repeat(50) + '\n');

  if (!config.hotzone.username || !config.hotzone.password) {
    console.error('❌ ERROR: Credenciales no configuradas.');
    console.error('   1. Copia .env.example a .env');
    console.error('   2. Abre .env y completa HOTZONE_USER y HOTZONE_PASS');
    console.error('   3. Intenta nuevamente');
    process.exit(1);
  }

  const scraper = new HotzoneScraper();

  try {
    console.log('📍 Paso 1: Lanzando navegador...');
    await scraper.launch();
    console.log('✅ Navegador lanzado\n');

    console.log('📍 Paso 2: Intentando login...');
    const loginSuccess = await scraper.login();
    if (!loginSuccess) {
      console.error('❌ Login fallido. Posibles causas:');
      console.error('   - Credenciales incorrectas');
      console.error('   - El sitio cambió su estructura HTML');
      console.error('   - Problemas de conexión');
      process.exit(1);
    }
    console.log('✅ Login exitoso\n');

    console.log('📍 Paso 3: Extrayendo primeras novelas...');
    const novelas = await scraper.getLatestNovelas();
    
    if (novelas.length === 0) {
      console.warn('⚠️ No se encontraron novelas.');
    } else {
      console.log(`✅ Se encontraron ${novelas.length} novelas\n`);
      console.log('📋 Primeras 3 novelas encontradas:');
      novelas.slice(0, 3).forEach((n, i) => {
        console.log(`\n  ${i + 1}. ${n.titulo}`);
        console.log(`     Estado: ${n.estado || 'N/A'}`);
        console.log(`     Enlace: ${n.downloadDirect ? '✅ ' + n.downloadDirect.substring(0, 50) + '...' : '❌ No disponible'}`);
        console.log(`     Portada: ${n.portada ? '✅' : '❌'}`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ PRUEBA EXITOSA');
    console.log('='.repeat(50));
    console.log('\n🚀 Ahora puedes ejecutar: npm start');
    console.log('   o con ejecución inmediata: npm start -- --now\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('\nDetalles completos:');
    console.error(err);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

testLogin();
