#!/usr/bin/env node

/**
 * 🔍 Debug avanzado para Harvis Bot
 * Uso: node debug.js
 * 
 * Este script ayuda a diagnosticar problemas de:
 * - Login en HotZone18
 * - Detección de elementos HTML
 * - Extracción de datos
 */

import puppeteer from 'puppeteer';
import config from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DebugBot {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async start() {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 DEBUG AVANZADO - Harvis Bot x HotZone18');
    console.log('='.repeat(70));
    console.log(`Fecha: ${new Date().toLocaleString()}`);
    console.log(`Debug: ${config.debug ? '✅ ACTIVADO' : '❌ Desactivado'}`);
    console.log('='.repeat(70) + '\n');

    try {
      await this.validateConfig();
      await this.testBrowser();
      await this.testLogin();
      await this.analyzePageStructure();
      
      console.log('\n✅ DEBUG COMPLETADO\n');
      await this.generateReport();
    } catch (err) {
      console.error('❌ Error durante debug:', err.message);
    } finally {
      await this.closeBrowser();
    }
  }

  async validateConfig() {
    console.log('📋 VALIDACIÓN DE CONFIGURACIÓN\n');
    
    const checks = {
      'HOTZONE_USER': config.hotzone.username,
      'HOTZONE_PASS': config.hotzone.password ? '✅ Configurada' : '❌ Falta',
      'URL Base': config.hotzone.baseUrl,
      'Max Novelas': config.hotzone.maxNovelas,
      'Request Delay': config.hotzone.requestDelay + 'ms',
      'Node Modules': fs.existsSync('node_modules') ? '✅ Instalado' : '❌ Falta'
    };

    for (const [key, value] of Object.entries(checks)) {
      const status = String(value).includes('✅') || String(value).includes('❌') 
        ? value 
        : '✅ ' + value;
      console.log(`  ${key}: ${status}`);
    }

    if (!config.hotzone.username || !config.hotzone.password) {
      throw new Error('❌ Credenciales no configuradas. Abre .env y completa HOTZONE_USER y HOTZONE_PASS');
    }

    console.log('\n');
  }

  async testBrowser() {
    console.log('🖥️ TEST DE NAVEGADOR\n');
    
    try {
      console.log('  Lanzando Puppeteer...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      console.log('  ✅ Navegador lanzado exitosamente');
      console.log(`  Versión Chrome: ${await this.browser.version()}`);
      
      this.page = await this.browser.newPage();
      console.log('  ✅ Página nueva creada\n');
    } catch (err) {
      throw new Error(`Error en navegador: ${err.message}`);
    }
  }

  async testLogin() {
    console.log('🔐 TEST DE LOGIN\n');

    try {
      const loginUrl = `${config.hotzone.baseUrl}/accede/?redirect_to=https%3A%2F%2Fwww.hotzone18.com%2Fcuenta-de-membresia%2F`;
      
      console.log(`  Navegando a: ${loginUrl}`);
      await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log('  ✅ Página de login cargada\n');

      // Analizar estructura de login
      console.log('  📍 Analizando estructura de formulario...\n');
      
      const formInfo = await this.page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        const inputs = document.querySelectorAll('input');
        const buttons = document.querySelectorAll('button, input[type="submit"]');

        return {
          formsCount: forms.length,
          inputsInfo: Array.from(inputs).map(i => ({
            type: i.type,
            name: i.name || 'sin-nombre',
            id: i.id || 'sin-id',
            placeholder: i.placeholder || 'sin-placeholder',
            value: i.value?.substring(0, 20) || 'vacío'
          })),
          buttonsInfo: Array.from(buttons).map(b => ({
            type: b.type,
            text: b.textContent?.trim().substring(0, 30),
            class: b.className
          }))
        };
      });

      console.log(`  Formas encontradas: ${formInfo.formsCount}`);
      console.log('\n  Campos de entrada:');
      formInfo.inputsInfo.forEach((info, i) => {
        console.log(`    ${i + 1}. type="${info.type}" name="${info.name}" placeholder="${info.placeholder}"`);
      });

      console.log('\n  Botones:');
      formInfo.buttonsInfo.forEach((info, i) => {
        console.log(`    ${i + 1}. type="${info.type}" text="${info.text}"`);
      });

      // Intentar login
      console.log('\n  Intentando login...');
      
      const userFields = await this.page.$$('input[type="text"]');
      const passFields = await this.page.$$('input[type="password"]');

      if (userFields.length === 0 || passFields.length === 0) {
        console.warn('\n  ⚠️ No se encontraron campos de login estándar');
        console.log('  💾 Salvando screenshot a: login-debug.png');
        await this.page.screenshot({ path: 'login-debug.png' });
        return;
      }

      await userFields[0].type(config.hotzone.username);
      console.log(`  ✅ Usuario ingresado: ${config.hotzone.username}`);

      await passFields[0].type(config.hotzone.password);
      console.log(`  ✅ Contraseña ingresada (${config.hotzone.password.length} caracteres)`);

      const submitBtn = await this.page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log('  ✅ Botón de submit clickeado');
      } else {
        await this.page.keyboard.press('Enter');
        console.log('  ✅ Enter presionado');
      }

      // Esperar a la navegación
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.log('  ⚠️ Timeout esperando navegación (podría estar en iframe)');
      }

      await new Promise(r => setTimeout(r, 2000));

      // Verificar si login fue exitoso
      const currentUrl = this.page.url();
      const cookiesCount = (await this.page.cookies()).length;

      console.log(`\n  URL actual: ${currentUrl}`);
      console.log(`  Cookies guardadas: ${cookiesCount}`);

      if (currentUrl.includes('membresia') || cookiesCount > 0) {
        console.log('  ✅ LOGIN APARENTA SER EXITOSO\n');
      } else {
        console.log('  ⚠️ Login podría haber fallado, continuando...\n');
      }

    } catch (err) {
      console.error(`\n  ❌ Error en login: ${err.message}`);
      console.log('  Continuando con análisis...\n');
    }
  }

  async analyzePageStructure() {
    console.log('📄 ANÁLISIS DE ESTRUCTURA DE PÁGINA\n');

    try {
      // Navegar a página principal
      console.log('  Navegando a página principal...');
      await this.page.goto(`${config.hotzone.baseUrl}/`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const structure = await this.page.evaluate(() => {
        // Encontrar enlaces de novelas
        const selectors = {
          '.post-card-link': document.querySelectorAll('.post-card-link').length,
          '.game-item': document.querySelectorAll('.game-item').length,
          'article a': document.querySelectorAll('article a').length,
          'a[href*="/juego/"]': document.querySelectorAll('a[href*="/juego/"]').length,
          'a[href*="/novela/"]': document.querySelectorAll('a[href*="/novela/"]').length,
        };

        // Encontrar primeros enlaces
        const allLinks = document.querySelectorAll('a[href*="hotzone"]');
        const novelLinks = Array.from(allLinks)
          .filter(a => !a.href.includes('login') && !a.href.includes('account'))
          .slice(0, 5)
          .map(a => a.href);

        return { selectors, novelLinks };
      });

      console.log('  Selectores encontrados:');
      for (const [selector, count] of Object.entries(structure.selectors)) {
        console.log(`    ${selector}: ${count} elementos`);
      }

      console.log('\n  Primeros enlaces encontrados:');
      structure.novelLinks.forEach((link, i) => {
        console.log(`    ${i + 1}. ${link}`);
      });

      // Si encontramos enlaces, analizar uno
      if (structure.novelLinks.length > 0) {
        console.log('\n  Analizando primer enlace...');
        await this.page.goto(structure.novelLinks[0], { waitUntil: 'networkidle2', timeout: 20000 });

        const novelInfo = await this.page.evaluate(() => {
          const titulo = document.querySelector('h1, h1.entry-title')?.textContent?.trim() || 'NO ENCONTRADO';
          const links = Array.from(document.querySelectorAll('a[href*="mediafire"], a[href*="mega"]'))
            .map(a => ({
              text: a.textContent?.trim().substring(0, 40),
              href: a.href,
              class: a.className
            }));

          return { titulo, links };
        });

        console.log(`\n  Novela: ${novelInfo.titulo}`);
        console.log(`  Enlaces de descarga encontrados: ${novelInfo.links.length}`);
        novelInfo.links.forEach((link, i) => {
          console.log(`    ${i + 1}. ${link.text}`);
          console.log(`       URL: ${link.href.substring(0, 60)}...`);
        });
      }

      console.log('\n');
    } catch (err) {
      console.error(`  ❌ Error en análisis: ${err.message}\n`);
    }
  }

  async generateReport() {
    console.log('📊 RESUMEN DEL DEBUG\n');
    
    console.log('Recomendaciones:');
    console.log('1. Si el login falla:');
    console.log('   - Verifica credenciales en .env');
    console.log('   - Asegúrate de tener membresía VIP');
    console.log('   - Intenta login manual en navegador\n');

    console.log('2. Si no se encuentran novelas:');
    console.log('   - HotZone18 cambió estructura HTML');
    console.log('   - Verifica URL: https://www.hotzone18.com');
    console.log('   - Contacta para actualización de selectores\n');

    console.log('3. Si falta archivo login-debug.png:');
    console.log('   - Probablemente el login fue exitoso');
    console.log('   - Si no, activa DEBUG=true en .env\n');

    console.log('Próximo paso:');
    console.log('  npm start -- --now');
    console.log('\n');
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Ejecutar
const debug = new DebugBot();
debug.start().catch(console.error);
