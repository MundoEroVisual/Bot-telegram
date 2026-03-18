import axios from 'axios';
import config from '../config.js';

const DEBUG = config.debug;

class DiscordManager {
  constructor() {
    this.botToken = config.discord.botToken;
    this.channels = config.discord.channels || [];
    this.enabled = config.discord.enabled;
    this.apiUrl = 'https://discord.com/api/v10';
    this.webBaseUrl = config.webBaseUrl;
  }

  log(message) {
    if (DEBUG) console.log(`[DiscordManager] ${message}`);
  }

  /**
   * Envía un mensaje a Discord con portada y spoilers en UN SOLO MENSAJE
   * @param {object} novela - Objeto con datos de la novela
   * @returns {Promise<number>} Cantidad de canales a los que se envió exitosamente
   */
  async sendNovela(novela) {
    if (!this.enabled || this.channels.length === 0) {
      this.log('⚠️ Discord no configurado, saltando envío');
      return 0;
    }

    let enviados = 0;

    for (const channelId of this.channels) {
      try {
        this.log(`🎮 Enviando a Discord canal ${channelId}: ${novela.titulo}`);

        // URL de la novela en la web
        const novelaUrl = `${this.webBaseUrl}${novela.id}`;

        // Crear embed principal con portada
        const generosText = novela.generos && novela.generos.length > 0 
          ? novela.generos.join(', ')
          : 'Sin géneros';

        const embeds = [];

        // Embed 1: Principal con portada
        embeds.push({
          title: novela.titulo,
          description: novela.desc,
          color: 0xFF1493, // Deep Pink
          image: {
            url: novela.portada,
          },
          fields: [
            {
              name: '📂 Géneros',
              value: generosText,
              inline: false,
            },
            {
              name: '📊 Estado',
              value: novela.estado,
              inline: true,
            },
            {
              name: '📅 Fecha',
              value: novela.fecha,
              inline: true,
            },
            {
              name: '🔗 Ver detalles y descargar',
              value: `[Abrir página](${novelaUrl})`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        });

        // Embeds adicionales: Spoilers (máximo 9 más para total de 10)
        if (novela.spoilers && novela.spoilers.length > 0) {
          const spoilersLimitados = novela.spoilers.slice(0, 9); // Máximo 9 embeds de spoilers
          spoilersLimitados.forEach((imageUrl, index) => {
            embeds.push({
              title: index === 0 ? '📸 Spoilers' : '',
              image: {
                url: imageUrl,
              },
              color: 0x9932CC, // Dark Violet
            });
          });
        }

        // Enviar TODO en UN SOLO mensaje (hasta 10 embeds)
        const response = await axios.post(
          `${this.apiUrl}/channels/${channelId}/messages`,
          {
            embeds: embeds,
          },
          {
            headers: {
              Authorization: `Bot ${this.botToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        if (response.status === 200 || response.status === 201) {
          this.log(`   ✅ Portada + ${embeds.length - 1} spoilers enviados en 1 mensaje`);
          enviados++;
        } else {
          console.error(`❌ Error de Discord: ${response.status}`);
        }
      } catch (err) {
        console.error(`❌ Error enviando a Discord canal ${channelId}: ${err.message}`);
        if (err.response?.data) {
          console.error(`Detalles:`, err.response.data);
        }
      }

      // Pausa entre canales
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return enviados;
  }

  /**
   * Envía múltiples novelas a todos los canales
   * @param {Array} novelas - Array de novelas
   * @returns {Promise<number>} Cantidad total de mensajes enviados exitosamente
   */
  async sendNovelas(novelas) {
    if (!this.enabled) {
      this.log('⚠️ Discord no configurado');
      return 0;
    }

    let totalEnviados = 0;
    for (const novela of novelas) {
      const canalesEnviados = await this.sendNovela(novela);
      totalEnviados += canalesEnviados;
      // Pausa entre novelas
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return totalEnviados;
  }
}

export default new DiscordManager();
