import axios from 'axios';
import config from '../config.js';

const DEBUG = config.debug;

class GitHubManager {
  constructor() {
    this.apiUrl = 'https://api.github.com';
    this.owner = config.github.owner;
    this.repo = config.github.repo;
    this.token = config.github.token;
    this.branch = config.github.branch;
    this.enabled = config.github.enabled;
  }

  log(message) {
    if (DEBUG) console.log(`[GitHubManager] ${message}`);
  }

  /**
   * Busca el ID más alto en todos los archivos novelas-*.json del repositorio
   * Verifica dentro de cada archivo JSON para encontrar IDs máximos
   * @returns {Promise<number>} ID más alto encontrado (0 si no hay archivos)
   */
  async getMaxNovelaNumber() {
    if (!this.enabled) {
      this.log('❌ GitHub no configurado');
      return 0;
    }

    try {
      this.log('🔍 Buscando IDs máximos en todos los archivos de GitHub...');

      // Obtener contenido de la carpeta data/novelas
      const response = await axios.get(
        `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/novelas`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
          timeout: 10000,
        }
      );

      const files = response.data;
      let maxId = 0;

      // Procesar cada archivo novelas-*.json
      for (const file of files) {
        if (file.name.match(/^novelas-\d+\.json$/)) {
          try {
            this.log(`   📄 Analizando ${file.name}...`);
            
            // Obtener contenido del archivo
            const contentResponse = await axios.get(file.download_url, {
              timeout: 10000,
            });

            const novelas = contentResponse.data;
            
            // Buscar ID máximo en este archivo
            if (Array.isArray(novelas)) {
              novelas.forEach((novela) => {
                // Validar que novela.id existe y es válido
                if (novela.id !== undefined && novela.id !== null && novela.id !== '') {
                  try {
                    // Convertir ID a número (ej: "305" -> 305)
                    const idStr = String(novela.id).trim();
                    const match = idStr.match(/\d+/);
                    
                    if (match && match[0]) {
                      const idNum = parseInt(match[0], 10);
                      if (!isNaN(idNum) && idNum > maxId) {
                        maxId = idNum;
                        this.log(`      ID encontrado: ${idNum}`);
                      }
                    }
                  } catch (parseErr) {
                    // Saltar IDs que no se pueden parsear
                    this.log(`      ⚠️ ID inválido: ${novela.id}`);
                  }
                }
              });
            }
          } catch (err) {
            console.error(`⚠️ Error leyendo ${file.name}: ${err.message}`);
          }

          // Esperar 0.5s entre requests para no sobrecargar GitHub
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      this.log(`✅ ID máximo encontrado: ${maxId}`);
      return maxId;
    } catch (err) {
      console.error(`❌ Error obteniendo ID máximo: ${err.message}`);
      if (err.response) {
        console.error(`Status: ${err.response.status}`);
        console.error(`Data:`, err.response.data);
      }
      return 0;
    }
  }

  /**
   * Pushea un archivo JSON a GitHub, fusionando con contenido existente
   * @param {string} fileName - Nombre del archivo en GitHub (ej: novelas-1.json)
   * @param {object} fileContent - Contenido del archivo (será convertido a JSON)
   * @returns {Promise<boolean>} true si fue exitoso
   */
  async pushFile(fileName, fileContent) {
    if (!this.enabled) {
      this.log('❌ GitHub no configurado, saltando push');
      return false;
    }

    try {
      this.log(`📤 Procesando ${fileName} para GitHub...`);

      let contentToSave = fileContent;

      // Obtener contenido existente si el archivo ya existe
      try {
        const existingContent = await this.getNovelaByNumber(
          fileName.match(/\d+/)[0]
        );
        if (existingContent && Array.isArray(existingContent)) {
          this.log(`   Fusionando con ${existingContent.length} novelas existentes...`);

          // Crear mapa de novelas existentes por URL
          const existingMap = new Map(
            existingContent.map((n) => [n.url || n.titulo, n])
          );

          // Agregar nuevas novelas
          if (Array.isArray(fileContent)) {
            fileContent.forEach((novela) => {
              const key = novela.url || novela.titulo;
              existingMap.set(key, novela); // Actualizar si existe, agregar si no
            });
          }

          // Convertir mapa a array
          contentToSave = Array.from(existingMap.values());
          this.log(`   Total después de fusión: ${contentToSave.length} novelas`);
        }
      } catch (e) {
        // Archivo no existe, usaremos el contenido nuevo
        this.log(`   Archivo no existe en GitHub, se creará nuevo`);
      }

      const contentStr = JSON.stringify(contentToSave, null, 2);
      const contentBase64 = Buffer.from(contentStr).toString('base64');

      // Obtener SHA del archivo si existe
      let sha = null;
      try {
        const getResponse = await axios.get(
          `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/novelas/${fileName}`,
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
        // Archivo no existe, lo crearemos
        this.log(`   Archivo no existe, se creará nuevo`);
      }

      // Pushear archivo
      const pushData = {
        message: `Auto: Agregar/actualizar ${fileName}`,
        content: contentBase64,
        branch: this.branch,
      };

      if (sha) {
        pushData.sha = sha;
      }

      const pushResponse = await axios.put(
        `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/novelas/${fileName}`,
        pushData,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
          timeout: 10000,
        }
      );

      if (pushResponse.status === 201 || pushResponse.status === 200) {
        console.log(
          `✅ ${fileName} pusheado exitosamente a GitHub (${Array.isArray(contentToSave) ? contentToSave.length : 1} novelas)`
        );
        return true;
      }
    } catch (err) {
      console.error(`❌ Error pusheando ${fileName} a GitHub: ${err.message}`);
      if (err.response) {
        console.error(`Status: ${err.response.status}`);
        console.error(`Data:`, err.response.data);
      }
      return false;
    }
  }

  /**
   * Obtiene una novela de GitHub por número
   * @param {number} number - Número de novela (ej: 1)
   * @returns {Promise<object>} Contenido del archivo o null si no existe
   */
  async getNovelaByNumber(number) {
    if (!this.enabled) {
      return null;
    }

    try {
      const fileName = `novelas-${number}.json`;
      const response = await axios.get(
        `${this.apiUrl}/repos/${this.owner}/${this.repo}/contents/data/novelas/${fileName}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3.raw',
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (err) {
      this.log(`⚠️ No se pudo obtener novelas-${number}.json: ${err.message}`);
      return null;
    }
  }
}

export default new GitHubManager();
