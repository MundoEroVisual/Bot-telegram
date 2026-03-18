import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import config from '../config.js';

const DEBUG = config.debug;

class HotzoneScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = null;
  }

  log(message) {
    if (DEBUG) console.log(`[HotzoneScraper] ${message}`);
  }

  async shortenWithCuty(longUrl) {
    if (!config.cuty.enabled) {
      this.log('⚠️ Cuty.io no configurado, retornando URL original');
      return longUrl;
    }

    try {
      this.log(`🔗 Acortando URL con Cuty.io: ${longUrl.substring(0, 50)}...`);
      
      const response = await axios.get(config.cuty.apiUrl, {
        params: {
          token: config.cuty.token,
          url: encodeURIComponent(longUrl),
        },
        timeout: 10000
      });

      // Cuty.io retorna short_url en la respuesta
      const shortenedUrl = response.data.short_url || response.data.url || response.data.shortenedUrl;
      if (shortenedUrl) {
        this.log(`✅ URL acortada exitosamente: ${shortenedUrl}`);
        return shortenedUrl;
      } else {
        this.log(`⚠️ Respuesta inesperada de Cuty.io: ${JSON.stringify(response.data)}`);
        return longUrl;
      }
    } catch (err) {
      console.error(`❌ Error acortando URL con Cuty.io: ${err.message}`);
      this.log(`Continuando con URL original: ${longUrl.substring(0, 50)}...`);
      return longUrl;
    }
  }

  async launch() {
    try {
      this.log('Lanzando navegador Puppeteer...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.log('Navegador lanzado exitosamente');
      return true;
    } catch (err) {
      console.error('❌ Error al lanzar navegador:', err.message);
      return false;
    }
  }

  async login() {
    try {
      if (!this.browser) await this.launch();
      
      this.log('Iniciando sesión en HotZone18...');
      this.page = await this.browser.newPage();

      // Navegar directamente a la página de login
      const loginUrl = `${config.hotzone.baseUrl}/accede/?redirect_to=https%3A%2F%2Fwww.hotzone18.com%2Fcuenta-de-membresia%2F`;
      this.log(`Navegando a: ${loginUrl}`);

      await this.page.goto(loginUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      this.log('Página de login cargada');

      // Esperar a que se carguen los campos de login
      await this.page.waitForSelector('input[type="text"], input[type="password"]', { 
        timeout: 10000 
      }).catch(() => {
        this.log('Timeout esperando campos de login, continuando...');
      });

      // Ingresa credenciales con múltiples estrategias
      const userFields = await this.page.$$('input[type="text"]');
      const passFields = await this.page.$$('input[type="password"]');

      if (userFields.length === 0 || passFields.length === 0) {
        console.warn('⚠️ No se encontraron campos de login. Intentando alternativas...');
        
        // Estrategia alternativa: buscar por atributos
        const allInputs = await this.page.$$('input');
        for (const input of allInputs) {
          const name = await this.page.evaluate(el => el.name || el.id || el.placeholder, input);
          this.log(`Campo encontrado: ${name}`);
        }

        // Mostrar pantalla para debug
        if (DEBUG) await this.page.screenshot({ path: 'login-debug.png' });
        return false;
      }

      // Rellenar campo de usuario (primer input de texto)
      await userFields[0].type(config.hotzone.username, { delay: 50 });
      this.log('Usuario ingresado');

      // Rellenar campo de contraseña
      await passFields[0].type(config.hotzone.password, { delay: 50 });
      this.log('Contraseña ingresada');

      // Enviar formulario
      const submitBtn = await this.page.$('button[type="submit"]') || 
                       await this.page.$('input[type="submit"]') ||
                       await this.page.$('button:contains("Entrar")') ||
                       await this.page.$('button:contains("enviar")');

      if (submitBtn) {
        this.log('Haciendo clic en botón de submit');
        await submitBtn.click();
      } else {
        this.log('No se encontró botón de submit, enviando con Enter');
        await this.page.keyboard.press('Enter');
      }

      // Esperar navegación tras login
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        this.log('Timeout en navegación post-login, continuando...');
      }

      // Dormir un poco para asegurar que la sesión esté establecida
      await new Promise(r => setTimeout(r, 2000));

      // Verificar si el login fue exitoso navegando a cuenta de membresía
      await this.page.goto(`${config.hotzone.baseUrl}/cuenta-de-membresia/`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });

      const pageContent = await this.page.content();
      const isLoggedIn = pageContent.includes('membresia') || pageContent.includes('cuenta');

      if (!isLoggedIn) {
        console.warn('⚠️ Posible fallo en login. La página no contiene indicadores de membresía.');
      }

      // Guardar cookies para reutilizar
      this.cookies = await this.page.cookies();
      this.log(`✅ Sesión iniciada. Cookies guardadas: ${this.cookies.length}`);

      return true;
    } catch (err) {
      console.error('❌ Error en login:', err.message);
      return false;
    }
  }

  async getLatestNovelas() {
    try {
      if (!this.page) {
        console.error('❌ No hay sesión activa. Ejecuta login() primero.');
        return [];
      }

      this.log('Obteniendo novelas recientes...');
      
      // Navegar a la página principal con sesión activa
      await this.page.goto(`${config.hotzone.baseUrl}/`, {
        waitUntil: 'networkidle2',
        timeout: 40000,
      });

      // Esperar a que carguen las novelas con múltiples selectores
      try {
        await this.page.waitForFunction(
          () => {
            const count = document.querySelectorAll(
              '.post-card-link, .game-item, article a, a[href*="/juego/"], a[href*="/novela/"]'
            ).length;
            return count > 0;
          },
          { timeout: 10000 }
        );
      } catch (e) {
        this.log('Timeout esperando novelas, continuando de todas formas...');
      }

      // Extraer enlaces de novelas con múltiples estrategias
      const links = await this.page.evaluate((maxNovelas) => {
        const selectors = [
          '.post-card-link',
          '.game-item',
          'article a',
          'a[href*="/juego/"]',
          'a[href*="/novela/"]',
          '.product-link',
          '[class*="game-link"]'
        ];

        const uniqueLinks = [];
        const seen = new Set();

        for (let selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (let el of elements) {
            if (uniqueLinks.length >= maxNovelas) break;
            const href = el.href;
            if (href && href.startsWith('http') && !seen.has(href) && href.includes('/')) {
              // Filtrar para asegurarse de que es un link de novela
              if (href.includes('hotzone18') && !href.includes('login') && !href.includes('account')) {
                seen.add(href);
                uniqueLinks.push(href);
              }
            }
          }
          if (uniqueLinks.length >= maxNovelas) break;
        }

        return uniqueLinks.slice(0, maxNovelas);
      }, config.hotzone.maxNovelas);

      this.log(`Encontrados ${links.length} enlaces de novelas`);

      if (links.length === 0) {
        console.warn('⚠️ No se encontraron enlaces. Verificando estructura del sitio...');
        const html = await this.page.content();
        this.log('Primeros 500 caracteres de la página:');
        console.log(html.substring(0, 500));
      }

      // Extraer detalles de cada novela
      const novelas = [];
      for (let i = 0; i < links.length; i++) {
        this.log(`Procesando novela ${i + 1}/${links.length}...`);
        const novela = await this.extractNovelaDetails(links[i]);
        
        // Validar antes de agregar
        if (novela && this.validateNovela(novela)) {
          novelas.push(novela);
        } else if (novela) {
          this.log(`⚠️ Novela rechazada por validación: ${novela.titulo}`);
        }
        
        // Delay para no sobrecargar
        await new Promise(r => setTimeout(r, config.hotzone.requestDelay));
      }

      return novelas;
    } catch (err) {
      console.error('❌ Error obteniendo novelas:', err.message);
      return [];
    }
  }

  async extractNovelaDetails(url) {
    try {
      this.log(`Extrayendo detalles de: ${url}`);
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 40000,
      });

      // Esperar explícitamente a que carguen los botones de descarga
      try {
        await this.page.waitForSelector('a.button', { timeout: 10000 });
      } catch (e) {
        this.log('⚠️ Timeout esperando botones, continuando...');
      }

      // IMPORTANTE: Abrir todos los elementos <details> (acordeones)
      // ya que los botones están dentro y pueden no estar renderizados si están cerrados
      try {
        await this.page.evaluate(() => {
          // Abrir todos los detalles
          document.querySelectorAll('details').forEach(el => {
            el.open = true;
          });
          
          // Abrir cualquier botón/enlace de spoilers si existe
          document.querySelectorAll('[class*="spoiler"] button, [data-action="spoiler"]').forEach(btn => {
            btn.click();
          });
          
          // Forzar reflow del DOM
          document.documentElement.offsetHeight;
        });
        this.log('📂 Acordeones y spoilers abiertos');
      } catch (e) {
        this.log('⚠️ Error abriendo acordeones');
      }

      // Esperar más tiempo después de abrir detalles para que se renderice el contenido
      await new Promise(r => setTimeout(r, 2000));

      const novela = await this.page.evaluate(() => {
        // ============================================
        // EXTRACCIÓN IDÉNTICA A HARVIS ROUTER.JS
        // ============================================

        // 1. TITULO - usar selector de Harvis
        const titulo = document.querySelector('h1.entry-title')?.textContent?.trim() || '';

        // 2. GÉNEROS - selector de Harvis
        const generos = [];
        document.querySelectorAll('div.entry-categories a').forEach(el => {
          const texto = el.textContent.trim();
          if (texto) generos.push(texto);
        });

        // 3. DESCRIPCIÓN - Harvis busca <p> con "Descripcion General"
        let desc = '';
        const descElements = document.querySelectorAll('p[style*="text-align: center"]');
        for (let p of descElements) {
          const strong = p.querySelector('strong');
          if (strong && strong.textContent.toLowerCase().includes('descripcion general')) {
            const blockquote = p.nextElementSibling;
            if (blockquote && blockquote.tagName === 'BLOCKQUOTE') {
              desc = blockquote.textContent.trim();
              break;
            }
          }
        }

        // Filtrar descripción (igual que Harvis)
        desc = desc.replace(/\n\s*\n[\s\S]*/g, '');
        desc = desc.replace(/S\d+ v?\d+\.\d+(\.\d+)?[\s\S]*/gi, '');
        desc = desc.replace(/Cambios[\s\S]*/gi, '');
        desc = desc.replace(/Descargar[\s\S]*/gi, '');
        desc = desc.replace(/\[PC\]:[\s\S]*/gi, '');
        desc = desc.replace(/ADVERTENCIA:[^\n]*\n?/gi, '');
        desc = desc.replace(/Este juego puede incluir etiquetas[\s\S]*?jugar\./gi, '');
        desc = desc.replace(/Spoilers[\s\S]*/gi, '');
        desc = desc.replace(/\n{2,}/g, '\n');
        desc = desc.trim();

        // 4. ESTADO - búsqueda mejorada
        let estado = '';
        const paragraphs = document.querySelectorAll('p');
        for (let p of paragraphs) {
          const text = p.textContent;
          if (text.includes('Estado:') || text.includes('estado:')) {
            // Buscar patrón: Estado: [valor]
            let match = text.match(/[Ee]stado:\s*([A-Za-záéíóúÁÉÍÓÚñÑ]+)/);
            if (match && match[1]) {
              estado = match[1].trim();
              break;
            }
            // Si hay un span dentro, usar su contenido
            const span = p.querySelector('span');
            if (span && span.textContent.trim()) {
              let spanText = span.textContent.trim();
              let spanMatch = spanText.match(/[A-Za-záéíóúÁÉÍÓÚñÑ]+/);
              if (spanMatch) {
                estado = spanMatch[0];
                break;
              }
            }
          }
        }
        
        // Si no se encontró, buscar en todo el body
        if (!estado) {
          const bodyText = document.body.textContent;
          let match = bodyText.match(/[Ee]stado[:\s]+([A-Za-záéíóúÁÉÍÓÚñÑ]+)/);
          if (match && match[1]) estado = match[1].trim();
        }

        // 5. PORTADA - busca imagen featured del post
        let portada = '';
        
        // Estrategia 1: Buscar directamente en la clase single-post-featured-image
        const featuredImg = document.querySelector('img.single-post-featured-image');
        if (featuredImg) {
          portada = featuredImg.getAttribute('data-src') || featuredImg.src;
          if (portada && !portada.startsWith('http')) {
            portada = '';
          }
        }
        
        // Estrategia 2: Si no se encontró, buscar en wp-post-image
        if (!portada) {
          const wpImg = document.querySelector('img.wp-post-image');
          if (wpImg) {
            portada = wpImg.getAttribute('data-src') || wpImg.src;
            if (portada && !portada.startsWith('http')) {
              portada = '';
            }
          }
        }
        
        // Estrategia 3: Buscar en figure.wp-block-image
        if (!portada) {
          const figureImg = document.querySelector('figure.wp-block-image img');
          if (figureImg) {
            const src = figureImg.getAttribute('data-src') || figureImg.src;
            if (src && src.startsWith('http') && !src.includes('gravatar') && !src.includes('avatar')) {
              portada = src;
            }
          }
        }
        
        // Estrategia 4: Si aún no hay portada, buscar primera imagen grande sin filtrar avatares
        if (!portada) {
          for (let img of document.querySelectorAll('img[data-src]')) {
            const src = img.getAttribute('data-src');
            if (src && src.startsWith('http') && src.includes('wp-content/uploads')) {
              portada = src;
              break;
            }
          }
        }

        // Limpiar portada: remover parámetros de tamaño si es necesario
        if (portada) {
          // Si tiene -200x200 o -600x600, remover y usar la versión original
          portada = portada.replace(/-\d+x\d+(\.\w+)$/gi, '$1');
        }

        // 6. SPOILERS - mejorado para buscar en detalles abiertos
        const spoilers = [];
        
        // Estrategia 1: Buscar en enlaces de imagen dentro de los detalles
        document.querySelectorAll('details a, .spoilers a, [class*="spoiler"] a').forEach(link => {
          const href = link.href || link.getAttribute('href');
          if (href && /\.(jpg|png|webp|gif)$/i.test(href)) {
            if (!spoilers.includes(href)) {
              spoilers.push(href);
            }
          }
        });
        
        // Estrategia 2: Buscar imágenes con data-src (lazyload)
        document.querySelectorAll('img[data-src], details img').forEach(img => {
          const src = img.getAttribute('data-src') || img.src;
          if (src && src.startsWith('http') && /\.(jpg|png|webp|gif)$/i.test(src)) {
            // Filtrar imágenes pequeñas (thumbnails) y logos
            if (!src.includes('gravatar') && !src.includes('avatar') && !src.includes('logo')) {
              if (!spoilers.includes(src)) {
                spoilers.push(src);
              }
            }
          }
        });
        
        // Estrategia 3: Regex en HTML para URLs de imagen en href
        const htmlContent = new XMLSerializer().serializeToString(document);
        const spoilerRegex = /href="(https?:\/\/[^\"]+\.(jpg|png|webp|gif))"/gi;
        let match;
        while ((match = spoilerRegex.exec(htmlContent)) !== null) {
          const url = match[1];
          if (!url.includes('gravatar') && !url.includes('avatar') && !spoilers.includes(url)) {
            spoilers.push(url);
          }
        }

        // 7. ANDROID y ANDROID_VIP - Búsqueda robusta usando múltiples métodos
        let android = '';
        let android_vip = '';
        
        // Método 1: Extraer todo el HTML del documento
        const fullHTML = document.documentElement.outerHTML;
        
        // Buscar enlaces Android en el HTML (patrón flexible)
        // Pattern: cualquier href seguido de texto que contenga "Descargar Para Android"
        const androidHrefs = [];
        const hrefRegex = /href="([^"]*(?:mediafire|pixeldrain|mega|gofile)[^"]*)"/gi;
        let hrefMatch;
        while ((hrefMatch = hrefRegex.exec(fullHTML)) !== null) {
          // Buscar si hay "Android" en los próximos 200 caracteres
          const htmlAfterHref = fullHTML.substring(hrefMatch.index + hrefMatch[0].length, hrefMatch.index + 300);
          if (htmlAfterHref.toLowerCase().includes('android')) {
            androidHrefs.push({
              href: hrefMatch[1],
              html: htmlAfterHref
            });
          }
        }
        
        // Filtrar por Mediafire y Pixeldrain
        for (const link of androidHrefs) {
          if (!android && link.href.includes('mediafire') && link.html.toLowerCase().includes('mediafire')) {
            android = link.href;
          }
          if (!android_vip && link.href.includes('pixeldrain') && link.html.toLowerCase().includes('pixeldrain')) {
            android_vip = link.href;
          }
        }
        
        // Método 2: Fallback - búsqueda directa en botones DOM
        if (!android || !android_vip) {
          document.querySelectorAll('a.button').forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            const href = el.getAttribute('href') || el.href;
            
            if (!android && text.includes('android') && text.includes('mediafire')) {
              android = href;
            }
            if (!android_vip && text.includes('android') && text.includes('pixeldrain')) {
              android_vip = href;
            }
          });
        }

        return {
          titulo,
          desc,
          generos,
          portada,
          spoilers,
          android,
          android_vip,
          estado,
          peso: "",  // Inicialmente vacío, se calcula después con descargas
          fecha: new Date().toISOString().slice(0, 10),
          url: window.location.href,  // Para tracking y deduplicación
        };
      });

      if (novela.titulo) {
        this.log(`✅ Detalles extraídos: ${novela.titulo}`);
        this.log(`   Estado: ${novela.estado}`);
        this.log(`   Mediafire: ${novela.android ? '✅' : '❌'}`);
        this.log(`   Pixeldrain: ${novela.android_vip ? '✅' : '❌'}`);
        
        // REORGANIZAR ENLACES CON CUTY.IO
        // android: Mediafire acortado
        // android_vip: Mediafire sin acortar (o Pixeldrain si no hay Mediafire)
        
        let mediafire = novela.android;
        let pixeldrain = novela.android_vip;
        
        // Resetear valores
        novela.android = '';
        novela.android_vip = '';
        
        // android_vip: prioridad a Mediafire
        if (mediafire) {
          novela.android_vip = mediafire;
          this.log(`   ✅ Android VIP (Mediafire): ${mediafire.substring(0, 40)}...`);
        } else if (pixeldrain) {
          novela.android_vip = pixeldrain;
          this.log(`   ✅ Android VIP (Pixeldrain): ${pixeldrain.substring(0, 40)}...`);
        }
        
        // android: acortar Mediafire
        if (mediafire) {
          try {
            novela.android = await this.shortenWithCuty(mediafire);
            this.log(`   ✅ Android (Mediafire acortado): ${novela.android.substring(0, 40)}...`);
          } catch (err) {
            this.log(`⚠️ Error acortando Mediafire: ${err.message}`);
            novela.android = mediafire; // Usar sin acortar si falla
          }
        }
        
        return novela;
      }
      return null;
    } catch (err) {
      console.warn(`⚠️ Error extrayendo detalles de ${url}:`, err.message);
      return null;
    }
  }

  // Validar que una novela tenga datos necesarios
  validateNovela(novela) {
    // Validar que tenga título
    if (!novela || !novela.titulo || !novela.titulo.trim()) {
      return false;
    }

    // Validar que tenga portada válida
    if (!novela.portada || !novela.portada.toString().startsWith('http')) {
      this.log(`⚠️ Portada inválida para: ${novela.titulo}`);
      return false;
    }

    // Validar que tenga al menos una descripción o género
    if ((!novela.desc || !novela.desc.trim()) && (!novela.generos || novela.generos.length === 0)) {
      return false;
    }

    return true;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.log('Navegador cerrado');
    }
  }
}

export default HotzoneScraper;
