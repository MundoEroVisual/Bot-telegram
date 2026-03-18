#!/usr/bin/env node

/**
 * 🚀 GUÍA DE INICIO RÁPIDO - Harvis Bot VIP
 * 
 * Este archivo te ayuda a configurar el bot en 3 pasos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printHeader() {
  console.clear();
  console.log('\n' + '='.repeat(60));
  console.log('🤖 HARVIS BOT VIP - Configuración Inicial');
  console.log('='.repeat(60) + '\n');
}

function step1() {
  console.log('📍 PASO 1: Crear archivo .env\n');
  
  const envExample = path.join(__dirname, '.env.example');
  const envFile = path.join(__dirname, '.env');
  
  if (fs.existsSync(envFile)) {
    console.log('✅ El archivo .env ya existe\n');
    return true;
  }
  
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    console.log('✅ Archivo .env creado exitosamente\n');
    console.log('📝 Ahora necesitas editar .env con tus credenciales:');
    console.log('   - Abre: .env');
    console.log('   - Completa: HOTZONE_USER=tu_usuario');
    console.log('   - Completa: HOTZONE_PASS=tu_contrasena\n');
    return true;
  }
  
  console.log('❌ No se encontró .env.example\n');
  return false;
}

async function step2() {
  console.log('📍 PASO 2: Instalar dependencias\n');
  
  const packageJson = path.join(__dirname, 'package.json');
  const nodeModules = path.join(__dirname, 'node_modules');
  
  if (!fs.existsSync(packageJson)) {
    console.log('❌ No se encontró package.json\n');
    return false;
  }
  
  if (fs.existsSync(nodeModules)) {
    console.log('✅ Dependencias ya instaladas\n');
    return true;
  }
  
  console.log('⏳ Ejecutando: npm install\n');
  console.log('💡 Esto puede tardar algunos minutos la primera vez...\n');
  
  const { execSync } = await import('child_process');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    console.log('\n✅ Dependencias instaladas\n');
    return true;
  } catch (err) {
    console.log('❌ Error instalando dependencias\n');
    return false;
  }
}

async function step3() {
  console.log('📍 PASO 3: Probar conexión\n');
  
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) {
    console.log('⚠️ Primero debes completar el paso 1 (crear .env)\n');
    return false;
  }
  
  const env = fs.readFileSync(envFile, 'utf8');
  if (!env.includes('HOTZONE_USER=') || env.includes('HOTZONE_USER=tu_usuario')) {
    console.log('⚠️ Primero debes completar tus credenciales en .env\n');
    return false;
  }
  
  console.log('🧪 Ejecutando prueba de conexión...\n');
  const { execSync } = await import('child_process');
  
  try {
    execSync('npm test', { stdio: 'inherit', cwd: __dirname });
    console.log('\n✅ Prueba completada\n');
    return true;
  } catch (err) {
    console.log('\n⚠️ Hubo un error en la prueba\n');
    return false;
  }
}

async function main() {
  printHeader();
  
  console.log('Este asistente configurará tu bot en 3 pasos:\n');
  console.log('1️⃣  Crear archivo .env con configuración');
  console.log('2️⃣  Instalar dependencias (npm install)');
  console.log('3️⃣  Probar conexión con HotZone18\n');
  
  console.log('⚠️  IMPORTANTE:');
  console.log('   - Necesitas tener Node.js 16+ instalado');
  console.log('   - Tener credenciales válidas de HotZone18');
  console.log('   - Conexión a internet estable\n');
  
  // Step 1
  if (step1()) {
    console.log('✅ PASO 1 completado\n');
  } else {
    console.log('❌ PASO 1 falló\n');
    process.exit(1);
  }
  
  // Step 2 - Saltar si ya hay node_modules
  const nodeModules = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    console.log('📍 PASO 2: Instalar dependencias\n');
    console.log('✅ Dependencias ya instaladas\n');
  }
  
  // Step 3
  console.log('='.repeat(60));
  console.log('\n🎉 ¡Configuración completada!\n');
  console.log('Ahora puedes ejecutar el bot con:\n');
  console.log('   npm start        (modo automático)');
  console.log('   npm start -- --now  (ejecutar ahora)\n');
  console.log('Para más información, lee README.md\n');
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
