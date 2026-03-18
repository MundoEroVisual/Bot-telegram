import puppeteer from 'puppeteer';
import config from './config.js';
import fs from 'fs-extra';

/**
 * Script para inspeccionar la estructura actual de HotZone18
 * Útil para debuggear selectores y encontrar cómo están organizados los botones
 */

class PageInspector {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async launch() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async inspectPage(url) {
    if (!this.browser) await this.launch();
    
    this.page = await this.browser.newPage();
    
    // Usar cookies si están disponibles
    if (global.cookies) {
      await this.page.setCookie(...global.cookies);
    }

    console.log(`📄 Navegando a: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 35000 });

    // Pequeña pausa para asegurar carga completa
    await new Promise(r => setTimeout(r, 2000));

    const analysis = await this.page.evaluate(() => {
      // Analizar todos los elementos con clase "button" o que parecen botones
      const analysis = {
        allButtons: [],
        allLinks: [],
        downloadElements: [],
        pageInfo: {
          title: document.title,
          hasEntryTitle: !!document.querySelector('h1.entry-title'),
          hasDownloadSection: !!document.body.textContent.toLowerCase().includes('descargar'),
        }
      };

      // Recopilar todos los botones
      document.querySelectorAll('a.button, button, [role="button"]').forEach((el, idx) => {
        analysis.allButtons.push({
          idx,
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 50),
          href: el.href || el.getAttribute('href') || 'sin href',
          class: el.className,
          id: el.id,
        });
      });

      // Recopilar todos los enlaces que contienen "descargar"
      document.querySelectorAll('a').forEach((el, idx) => {
        const text = el.textContent.trim().toLowerCase();
        if (text.includes('descargar') || text.includes('download')) {
          analysis.downloadElements.push({
            idx,
            text: el.textContent.trim().substring(0, 100),
            href: el.href || el.getAttribute('href') || 'sin href',
            parent: el.parentElement?.tagName,
            class: el.className,
          });
        }
      });

      // Recopilar primeros 20 enlaces únicos con href
      const seenHrefs = new Set();
      document.querySelectorAll('a[href]').forEach((el, idx) => {
        const href = el.href;
        if (!seenHrefs.has(href) && seenHrefs.size < 20) {
          seenHrefs.add(href);
          analysis.allLinks.push({
            text: el.textContent.trim().substring(0, 50),
            href,
            class: el.className,
          });
        }
      });

      // Buscar específicamente por palabras clave
      analysis.hasAndroidText = !!document.body.textContent.includes('Android');
      analysis.hasMediafireText = !!document.body.textContent.includes('Mediafire');
      analysis.hasVIPText = !!document.body.textContent.includes('VIP');

      return analysis;
    });

    return analysis;
  }

  async inspectWithLogin(novelUrl) {
    if (!this.browser) await this.launch();

    // Crear página para login
    const loginPage = await this.browser.newPage();
    
    console.log('🔐 Realizando login...');
    const loginUrl = `${config.hotzone.baseUrl}/accede/?redirect_to=https%3A%2F%2Fwww.hotzone18.com%2Fcuenta-de-membresia%2F`;
    
    await loginPage.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Esperar por campos de login
    await loginPage.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️ Timeout esperando login fields')
    });

    // Rellenar login
    const userFields = await loginPage.$$('input[type="text"]');
    const passFields = await loginPage.$$('input[type="password"]');

    if (userFields.length > 0 && passFields.length > 0) {
      await userFields[0].type(config.hotzone.username, { delay: 30 });
      await passFields[0].type(config.hotzone.password, { delay: 30 });
      
      const submitBtn = await loginPage.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await loginPage.keyboard.press('Enter');
      }

      try {
        await loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.log('⚠️ Timeout en navegación post-login');
      }

      // Guardar cookies para reutilizar
      global.cookies = await loginPage.cookies();
      console.log(`✅ Login completado. Cookies: ${global.cookies.length}`);
      
      await loginPage.close();

      // Ahora inspeccionar página con sesión activa
      return this.inspectPage(novelUrl);
    }

    return null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Script principal
async function main() {
  const inspector = new PageInspector();

  try {
    // Obtener URL de ejemplo (primera novela si existen archivos)
    const novelasPath = config.paths.novelasJson;
    let testUrl = 'https://www.hotzone18.com/';

    if (fs.existsSync(novelasPath)) {
      const content = await fs.readFile(novelasPath, 'utf8');
      const novelas = JSON.parse(content);
      if (novelas.length > 0 && novelas[0].url) {
        testUrl = novelas[0].url;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🔍 INSPECTOR DE PÁGINA HOTZONE18');
    console.log('='.repeat(60) + '\n');

    // Inspeccionar sin login primero
    console.log('📊 ANÁLISIS SIN LOGIN:');
    console.log('-'.repeat(40));
    
    const inspector1 = new PageInspector();
    const analysis = await inspector1.inspectPage(testUrl);
    
    console.log('\n📄 Información de página:');
    console.log(`  Título: ${analysis.pageInfo.title}`);
    console.log(`  Tiene h1.entry-title: ${analysis.pageInfo.hasEntryTitle}`);
    console.log(`  Tiene texto "Descargar": ${analysis.pageInfo.hasDownloadSection}`);
    console.log(`  Tiene "Android": ${analysis.hasAndroidText}`);
    console.log(`  Tiene "Mediafire": ${analysis.hasMediafireText}`);
    console.log(`  Tiene "VIP": ${analysis.hasVIPText}`);

    console.log(`\n🔘 BOTONES ENCONTRADOS (${analysis.allButtons.length} total):`);
    analysis.allButtons.slice(0, 10).forEach(btn => {
      console.log(`  - ${btn.text}`);
      console.log(`    Href: ${btn.href?.substring(0, 60)}`);
    });
    if (analysis.allButtons.length > 10) {
      console.log(`  ... y ${analysis.allButtons.length - 10} más`);
    }

    console.log(`\n📥 ELEMENTOS DE DESCARGA (${analysis.downloadElements.length} total):`);
    analysis.downloadElements.forEach(el => {
      console.log(`  - ${el.text}`);
      console.log(`    Href: ${el.href?.substring(0, 60)}`);
    });

    // Guardar análisis completo a archivo
    const reportPath = 'page-analysis.json';
    await fs.writeFile(reportPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📊 Análisis completo guardado en: ${reportPath}`);

    // Ahora con login (si se proporciona URL)
    if (process.argv[2]) {
      console.log('\n' + '='.repeat(60));
      console.log('📊 ANÁLISIS CON LOGIN:');
      console.log('-'.repeat(40) + '\n');
      
      const analysisWithLogin = await inspector.inspectWithLogin(process.argv[2]);
      
      console.log('\n🔘 BOTONES ENCONTRADOS (con login):');
      analysisWithLogin.allButtons.slice(0, 10).forEach(btn => {
        console.log(`  - ${btn.text}`);
        console.log(`    Href: ${btn.href?.substring(0, 60)}`);
      });

      console.log(`\n📥 ELEMENTOS DE DESCARGA (con login):`);
      analysisWithLogin.downloadElements.forEach(el => {
        console.log(`  - ${el.text}`);
        console.log(`    Href: ${el.href?.substring(0, 60)}`);
      });

      const reportPath2 = 'page-analysis-with-login.json';
      await fs.writeFile(reportPath2, JSON.stringify(analysisWithLogin, null, 2));
      console.log(`\n📊 Análisis con login guardado en: ${reportPath2}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Inspección completada');
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await inspector.close();
  }
}

console.log('Uso: node inspect-page.js [URL_NOVELA_OPCIONAL]');
console.log('Ejemplo: node inspect-page.js https://www.hotzone18.com/novela-xxx\n');

main().catch(console.error);
