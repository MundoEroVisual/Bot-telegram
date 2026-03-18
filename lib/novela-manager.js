import fs from 'fs-extra';
import path from 'path';
import config from '../config.js';
import githubManager from './github-manager.js';
import telegramManager from './telegram-manager.js';
import discordManager from './discord-manager.js';
import announcedManager from './announced-manager.js';

class NovelaManager {
  constructor() {
    this.novelasPath = config.paths.novelasJson;
    this.imagesDir = config.paths.imagesDir;
    this.ensureDirectories();
  }

  ensureDirectories() {
    fs.ensureDirSync(path.dirname(this.novelasPath));
    fs.ensureDirSync(this.imagesDir);
  }

  async loadNovelas() {
    try {
      if (fs.existsSync(this.novelasPath)) {
        const content = await fs.readFile(this.novelasPath, 'utf8');
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : [];
      }
    } catch (err) {
      console.warn(`⚠️ Error cargando novelas:`, err.message);
    }
    return [];
  }

  async saveNovelas(novelas) {
    try {
      await fs.writeFile(
        this.novelasPath,
        JSON.stringify(novelas, null, 2),
        'utf8'
      );
      const count = Array.isArray(novelas) ? novelas.length : 0;
      console.log(`✅ ${count} novelas guardadas en: ${this.novelasPath}`);
      return true;
    } catch (err) {
      console.error('❌ Error guardando novelas:', err.message);
      return false;
    }
  }

  async addNovelas(nuevas) {
    // Obtener número máximo actual de GitHub
    let maxNovelaNumber = 0;
    if (config.github.enabled) {
      maxNovelaNumber = await githubManager.getMaxNovelaNumber();
    }

    console.log(`📊 Número máximo en GitHub: ${maxNovelaNumber}`);

    // Cargar existentes
    const existentes = await this.loadNovelas();
    const novelasMap = new Map(existentes.map(n => [n.url || n.titulo, n]));

    // Agregar nuevas (reemplazando duplicados por URL/título)
    let agregadas = 0;
    const novelasAgrupadas = {}; // TODAS las nuevas novelas van al mismo archivo
    const archivoDestino = maxNovelaNumber > 0 ? maxNovelaNumber : 1; // Si no hay archivos, crear novelas-1.json

    for (const novela of nuevas) {
      const key = novela.url || novela.titulo;
      if (!novelasMap.has(key)) {
        // Asignar ID único incrementado para cada novela NUEVA
        const nuevoId = maxNovelaNumber + agregadas + 1;
        novela.id = String(nuevoId);
        novelasMap.set(key, novela);
        agregadas++;

        // TODAS las nuevas novelas van al mismo archivo (el del número máximo)
        if (!novelasAgrupadas[archivoDestino]) {
          novelasAgrupadas[archivoDestino] = [];
        }
        novelasAgrupadas[archivoDestino].push(novela);
      } else {
        // Actualizar si existe
        const existente = novelasMap.get(key);
        novelasMap.set(key, { ...existente, ...novela });
      }
    }

    const actualizado = Array.from(novelasMap.values());
    await this.saveNovelas(actualizado);
    console.log(`📝 ${agregadas} novelas nuevas agregadas`);

    // Pushear a GitHub
    if (config.github.enabled && agregadas > 0) {
      await this.pushToGitHub(novelasAgrupadas);
    }

    // Filtrar novelas no anunciadas y anunciar
    if ((config.telegram.enabled || config.discord.enabled) && agregadas > 0) {
      await this.announceNovelas(Array.from(novelasMap.values()));
    }

    return actualizado;
  }

  async announceNovelas(novelas) {
    console.log(`📢 Filtrando novelas para anunciar...`);
    
    if (!config.github.enabled) {
      console.log(`⚠️ GitHub no configurado, anunciando todas las novelas...`);
      
      // Anunciar a Telegram
      if (config.telegram.enabled) {
        const telegramEnviadas = await telegramManager.sendNovelas(novelas);
        console.log(`✉️ ${telegramEnviadas} novelas enviadas a Telegram`);
      }

      // Anunciar a Discord
      if (config.discord.enabled) {
        const discordEnviadas = await discordManager.sendNovelas(novelas);
        console.log(`🎮 ${discordEnviadas} novelas enviadas a Discord`);
      }

      return;
    }

    try {
      // Obtener novelas ya anunciadas
      const { nuevas, anunciadas } = await announcedManager.filterNewNovelas(novelas);

      if (nuevas.length === 0) {
        console.log(`✅ No hay novelas nuevas para anunciar`);
        return;
      }

      console.log(`🆕 ${nuevas.length} novelas nuevas para anunciar`);

      // Anunciar a Telegram
      if (config.telegram.enabled) {
        const telegramEnviadas = await telegramManager.sendNovelas(nuevas);
        console.log(`✉️ ${telegramEnviadas} novelas enviadas a Telegram`);
      }

      // Anunciar a Discord
      if (config.discord.enabled) {
        const discordEnviadas = await discordManager.sendNovelas(nuevas);
        console.log(`🎮 ${discordEnviadas} novelas enviadas a Discord`);
      }
    } catch (err) {
      console.error(`❌ Error anunciando novelas: ${err.message}`);
    }
  }

  async pushToGitHub(novelasAgrupadas) {
    console.log(`📤 Inicando push a GitHub...`);
    let pusheadas = 0;

    for (const [numero, novelas] of Object.entries(novelasAgrupadas)) {
      const fileName = `novelas-${numero}.json`;
      const success = await githubManager.pushFile(fileName, novelas);
      if (success) {
        pusheadas++;
      }
    }

    console.log(
      `✅ ${pusheadas} archivo(s) pusheado(s) exitosamente a GitHub`
    );
  }

  async getNovelaById(id) {
    const novelas = await this.loadNovelas();
    return novelas.find(n => n.id === id);
  }

  async updateNovela(id, updates) {
    const novelas = await this.loadNovelas();
    const idx = novelas.findIndex(n => n.id === id);
    if (idx !== -1) {
      novelas[idx] = { ...novelas[idx], ...updates };
      await this.saveNovelas(novelas);
      return novelas[idx];
    }
    return null;
  }

  async deleteNovela(id) {
    const novelas = await this.loadNovelas();
    const filtered = novelas.filter(n => n.id !== id);
    await this.saveNovelas(filtered);
    return filtered.length < novelas.length;
  }

  async getStats() {
    const novelas = await this.loadNovelas();
    return {
      total: novelas.length,
      conEnlace: novelas.filter(n => n.android_vip || n.android).length,
      conPortada: novelas.filter(n => n.portada).length,
      ultimas: novelas.slice(-5),
    };
  }

  async createDetailFile(novela) {
    try {
      const folder = path.join(this.imagesDir, (novela.titulo || 'unknown').replace(/[^a-zA-Z0-9]/g, '_'));
      await fs.ensureDir(folder);

      // Estructura de detalles igual que Harvis
      const details = {
        id: novela.id,
        titulo: novela.titulo,
        desc: novela.desc,
        generos: novela.generos || [],
        portada: novela.portada,
        spoilers: novela.spoilers || [],
        android: novela.android || '',
        android_vip: novela.android_vip || '',
        estado: novela.estado,
        peso: novela.peso || '',
        fecha: novela.fecha,
      };

      await fs.writeFile(
        path.join(folder, 'detalles.json'),
        JSON.stringify(details, null, 2),
        'utf8'
      );

      const txtContent = `
ID: ${details.id}
Título: ${details.titulo}
Estado: ${details.estado}
Géneros: ${Array.isArray(details.generos) ? details.generos.join(', ') : 'N/A'}
Peso: ${details.peso || 'N/A'}
Fecha: ${details.fecha}

Descripción:
${details.desc}

Descarga Android (Normal):
${details.android || 'No disponible'}

Descarga Android (VIP - Directo):
${details.android_vip || 'No disponible'}

Spoilers (${details.spoilers?.length || 0} imágenes):
${details.spoilers?.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'No disponible'}

URL de Portada:
${details.portada || 'No disponible'}
      `.trim();

      await fs.writeFile(
        path.join(folder, 'detalles.txt'),
        txtContent,
        'utf8'
      );

      return true;
    } catch (err) {
      console.warn(`⚠️ Error creando archivo de detalles:`, err.message);
      return false;
    }
  }
}

export default NovelaManager;
