import axios from 'axios';
import config from '../config.js';

const DEBUG = config.debug;

class AnnouncedManager {
  constructor() {
    this.apiUrl = 'https://api.github.com';
    this.owner = config.github.owner;
    this.repo = config.github.repo;
    this.token = config.github.token;
    this.branch = config.github.branch;
    this.enabled = config.github.enabled;
    this.fileName = 'announced.json'; // Archivo que guarda novelas anunciadas
  }

  log(message) {
    if (DEBUG) console.log(`[AnnouncedManager] ${message}`);
  }

  /**
   * Obtiene el archivo de novelas anunciadas desde GitHub
   * @returns {Promise<Array>} Array de IDs de novelas anunciadas
   */
  async getAnnouncedIds() {
    if (!this.enabled) {
      this.log('❌ GitHub no configurado');
      return [];
    }

    try {
      this.log('📥 Obteniendo novelas anunciadas de GitHub...');

      const response = await axios.get(
        `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/${this.fileName}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3.raw',
          },
          timeout: 10000,
        }
      );

      const announced = response.data;
      if (Array.isArray(announced)) {
        this.log(`✅ ${announced.length} novelas ya anunciadas`);
        return announced;
      }
      return [];
    } catch (err) {
      if (err.response?.status === 404) {
        this.log('📝 Archivo de anunciadas no existe, se creará nuevo');
        return [];
      }
      console.error(`❌ Error obteniendo anunciadas: ${err.message}`);
      return [];
    }
  }

  /**
   * Guarda las novelas anunciadas en GitHub
   * @param {Array} announcedIds - Array de IDs de novelas anunciadas
   * @returns {Promise<boolean>} true si fue exitoso
   */
  async saveAnnouncedIds(announcedIds) {
    if (!this.enabled) {
      this.log('❌ GitHub no configurado, saltando guardado');
      return false;
    }

    try {
      this.log(`📤 Guardando ${announcedIds.length} novelas anunciadas en GitHub...`);

      const contentStr = JSON.stringify(announcedIds, null, 2);
      const contentBase64 = Buffer.from(contentStr).toString('base64');

      // Obtener SHA del archivo si existe
      let sha = null;
      try {
        const getResponse = await axios.get(
          `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/${this.fileName}`,
          {
            headers: {
              Authorization: `token ${this.token}`,
              Accept: 'application/vnd.github.v3+json',
            },
            timeout: 10000,
          }
        );
        sha = getResponse.data.sha;
        this.log(`   SHA encontrado: ${sha.substring(0, 10)}...`);
      } catch (e) {
        this.log(`   Archivo no existe, se creará nuevo`);
      }

      // Pushear archivo
      const pushData = {
        message: `Auto: Actualizar novelas anunciadas (${announcedIds.length} total)`,
        content: contentBase64,
        branch: this.branch,
      };

      if (sha) {
        pushData.sha = sha;
      }

      const pushResponse = await axios.put(
        `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/${this.fileName}`,
        pushData,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
          timeout: 10000,
        }
      );

      if (pushResponse.status === 200 || pushResponse.status === 201) {
        this.log(`✅ Novelas anunciadas guardadas en GitHub`);
        return true;
      } else {
        console.error(`❌ Error guardando en GitHub: ${pushResponse.status}`);
        return false;
      }
    } catch (err) {
      console.error(`❌ Error guardando anunciadas: ${err.message}`);
      if (err.response?.data) {
        console.error(`Detalles:`, err.response.data);
      }
      return false;
    }
  }

  /**
   * Filtra novelas no anunciadas y actualiza el archivo de anunciadas
   * @param {Array} novelas - Array de novelas a verificar
   * @returns {Promise<{nuevas: Array, anunciadas: Array}>} Novelas nuevas y anunciadas
   */
  async filterNewNovelas(novelas) {
    if (!this.enabled) {
      this.log('⚠️ GitHub no configurado, devolviendo todas como nuevas');
      return {
        nuevas: novelas,
        anunciadas: [],
      };
    }

    try {
      // Obtener IDs ya anunciados
      const announcedIds = await this.getAnnouncedIds();
      const announcedSet = new Set(announcedIds);

      // Separar novelas nuevas y anunciadas
      const nuevas = [];
      const anunciadas = [];

      for (const novela of novelas) {
        if (announcedSet.has(String(novela.id))) {
          anunciadas.push(novela);
        } else {
          nuevas.push(novela);
        }
      }

      this.log(`📊 ${nuevas.length} nuevas, ${anunciadas.length} ya anunciadas`);

      // Actualizar lista de anunciadas
      const updatedAnnounced = [
        ...announcedIds,
        ...nuevas.map(n => String(n.id)),
      ];

      // Guardar nuevas anunciadas
      if (nuevas.length > 0) {
        await this.saveAnnouncedIds(updatedAnnounced);
      }

      return {
        nuevas,
        anunciadas,
      };
    } catch (err) {
      console.error(`❌ Error filtrando novelas: ${err.message}`);
      return {
        nuevas: novelas,
        anunciadas: [],
      };
    }
  }
}

export default new AnnouncedManager();
