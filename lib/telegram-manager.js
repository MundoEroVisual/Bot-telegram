import axios from 'axios';
import config from '../config.js';

const DEBUG = config.debug;

class TelegramManager {
  constructor() {
    this.botToken = config.telegram.botToken;
    this.channels = config.telegram.channels || [];
    this.enabled = config.telegram.enabled;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.webBaseUrl = config.webBaseUrl;
  }

  log(message) {
    if (DEBUG) console.log(`[TelegramManager] ${message}`);
  }

  /**
   * Envía un mensaje a Telegram con portada y spoilers en UN SOLO MENSAJE
   * @param {object} novela - Objeto con datos de la novela
   * @returns {Promise<number>} Cantidad de canales a los que se envió exitosamente
   */
  async sendNovela(novela) {
    if (!this.enabled || this.channels.length === 0) {
      this.log('⚠️ Telegram no configurado, saltando envío');
      return 0;
    }

    // Validar que la novela tenga portada
    if (!novela.portada || !novela.portada.toString().trim()) {
      console.error(`❌ ERROR: Novela sin portada - "${novela.titulo}"`);
      return 0;
    }

    // Validar que sea una URL válida
    if (!novela.portada.toString().startsWith('http')) {
      console.error(`❌ ERROR: Portada no es URL válida - "${novela.portada.toString().substring(0, 80)}"`);
      return 0;
    }

    let enviados = 0;

    for (const channelId of this.channels) {
      try {
        this.log(`📱 Enviando a Telegram canal ${channelId}: ${novela.titulo}`);

        // URL de la novela en la web
        const novelaUrl = `${this.webBaseUrl}${novela.id}`;

        // Crear caption con información de la novela
        const generosText = novela.generos && novela.generos.length > 0 
          ? novela.generos.join(' • ')
          : 'Sin géneros';

        const caption = `
<b>${novela.titulo}</b>

<i>${novela.desc}</i>

<b>Géneros:</b> ${generosText}
<b>Estado:</b> ${novela.estado}

<a href="${novelaUrl}">🔗 Ver detalles y descargar</a>
        `.trim();

        // Crear mediaGroup con portada + spoilers (validados)
        const mediaGroup = [];

        // Portada como primera imagen CON CAPTION
        mediaGroup.push({
          type: 'photo',
          media: novela.portada,
          caption: caption,
          parse_mode: 'HTML',
        });

        // Agregar SOLO spoilers válidos (URLs que comiencen con http)
        if (novela.spoilers && novela.spoilers.length > 0) {
          const spoilersValidos = novela.spoilers
            .filter(url => url && url.toString().trim() && url.toString().startsWith('http'))
            .slice(0, 9); // máximo 9 spoilers + 1 portada = 10 total

          spoilersValidos.forEach(imageUrl => {
            mediaGroup.push({
              type: 'photo',
              media: imageUrl,
            });
          });

          if (spoilersValidos.length < novela.spoilers.length) {
            this.log(`   ⚠️ ${novela.spoilers.length - spoilersValidos.length} spoilers inválidos ignorados`);
          }
        }

        // Intentar enviar con mediaGroup
        try {
          const response = await axios.post(`${this.apiUrl}/sendMediaGroup`, {
            chat_id: channelId,
            media: mediaGroup,
          }, {
            timeout: 15000,
          });

          if (response.data.ok || Array.isArray(response.data.result)) {
            this.log(`   ✅ Portada + ${mediaGroup.length - 1} spoilers enviados`);
            enviados++;
          } else {
            console.error(`❌ Error de Telegram: ${response.data.description}`);
          }
        } catch (mediaGroupErr) {
          // Si falla mediaGroup, intentar enviar solo la portada
          this.log(`   ⚠️ Error en mediaGroup (${mediaGroupErr.response?.status}): ${mediaGroupErr.response?.data?.description || mediaGroupErr.message}`);
          this.log(`   ⚠️ Usando fallback: sendPhoto...`);
          
          try {
            const fallbackResponse = await axios.post(`${this.apiUrl}/sendPhoto`, {
              chat_id: channelId,
              photo: novela.portada,
              caption: caption,
              parse_mode: 'HTML',
            }, {
              timeout: 10000,
            });

            if (fallbackResponse.data.ok) {
              this.log(`   ✅ Portada enviada (sin spoilers)`);
              enviados++;

              // Intentar enviar spoilers en un mensaje separado si existen y son válidos
              if (novela.spoilers && novela.spoilers.length > 0) {
                try {
                  const spoilersValidos = novela.spoilers
                    .filter(url => url && url.toString().trim() && url.toString().startsWith('http'))
                    .slice(0, 10);

                  if (spoilersValidos.length > 0) {
                    const spoilerMediaGroup = spoilersValidos.map(url => ({
                      type: 'photo',
                      media: url,
                    }));

                    await axios.post(`${this.apiUrl}/sendMediaGroup`, {
                      chat_id: channelId,
                      media: spoilerMediaGroup,
                    }, {
                      timeout: 15000,
                    });

                    this.log(`   ✅ ${spoilerMediaGroup.length} spoilers en mensaje aparte`);
                  }
                } catch (spoilerErr) {
                  this.log(`   ⚠️ No se pudieron enviar spoilers: ${spoilerErr.message}`);
                }
              }
            } else {
              console.error(`❌ Error en fallback: ${fallbackResponse.data.description}`);
            }
          } catch (fallbackErr) {
            // Si falla incluso el fallback, mostrar error detallado
            const errorData = fallbackErr.response?.data;
            if (errorData) {
              console.error(`❌ Error Telegram (estado=${fallbackErr.response.status}): ${JSON.stringify(errorData)}`);
              console.error(`❌ Portada: ${novela.portada}`);
            } else {
              console.error(`❌ Error enviando: ${fallbackErr.message}`);
            }
          }
        }
      } catch (err) {
        // Si es error 429 (rate limit), esperar más tiempo
        if (err.response?.status === 429) {
          const retryAfter = err.response.data?.parameters?.retry_after || 5;
          console.error(`❌ Rate limit (429). Esperando ${retryAfter}s...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return 0; // No contar este como enviado esta vuelta
        } else {
          console.error(`❌ Error enviando a Telegram ${channelId}: [${err.response?.status}] ${err.message}`);
        }
      }

      // Pausa entre canales para evitar rate limit
      await new Promise(resolve => setTimeout(resolve, 2000));
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
      this.log('⚠️ Telegram no configurado');
      return 0;
    }

    let totalEnviados = 0;
    for (const novela of novelas) {
      const canalesEnviados = await this.sendNovela(novela);
      totalEnviados += canalesEnviados;
      // Pausa MÁS LARGA entre novelas para evitar rate limit (3 segundos)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Limpiar mensajes de "usuario se unió" después de enviar novelas
    if (totalEnviados > 0) {
      this.log('🧹 Ejecutando limpieza automática después del envío...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s antes de limpiar
      await this.cleanJoinedMessages();
    }

    return totalEnviados;
  }
  /**
   * Elimina mensajes de "joined the group" del canal
   * Busca y elimina mensajes de sistema donde usuarios se unen al canal
   * @returns {Promise<number>} Cantidad de mensajes eliminados
   */
  async cleanJoinedMessages() {
    if (!this.enabled || this.channels.length === 0) {
      this.log('⚠️ Telegram no configurado');
      return 0;
    }

    let totalEliminados = 0;

    for (const channelId of this.channels) {
      try {
        this.log(`🧹 Limpiando mensajes de "${channelId}"...`);

        // Obtener los últimos 100 mensajes del canal
        const response = await axios.post(`${this.apiUrl}/getUpdates`, {
          limit: 100,
          timeout: 10,
        }, {
          timeout: 15000,
        });

        if (!response.data.ok || !response.data.result) {
          this.log(`⚠️ No se pudieron obtener mensajes del canal ${channelId}`);
          continue;
        }

        const updates = response.data.result;
        let eliminadosEstaVuelta = 0;

        for (const update of updates) {
          if (!update.message) continue;

          const msg = update.message;
          
          // Detectar mensajes de "usuario se unió" (new_chat_members)
          if (msg.new_chat_members && msg.new_chat_members.length > 0) {
            try {
              // Obtener ID numérico del canal si viene en formato @nombre
              let chatId = channelId;
              if (typeof channelId === 'string' && channelId.startsWith('@')) {
                // Si es @nombre, usar el nombre tal cual
                chatId = channelId;
              }

              // Intentar eliminar el mensaje
              const deleteResponse = await axios.post(`${this.apiUrl}/deleteMessage`, {
                chat_id: chatId,
                message_id: msg.message_id,
              }, {
                timeout: 10000,
              });

              if (deleteResponse.data.ok) {
                eliminadosEstaVuelta++;
                const usuarios = msg.new_chat_members.map(u => u.first_name || u.username).join(', ');
                this.log(`   ✅ Eliminado: ${usuarios} se unió`);
              }
            } catch (delErr) {
              // Ignorar errores de eliminación (pueden ser permisos o mensajes ya eliminados)
              if (delErr.response?.status !== 400) {
                this.log(`   ⚠️ Error al eliminar mensaje ${msg.message_id}: ${delErr.message}`);
              }
            }

            // Pequeña pausa entre eliminaciones
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        if (eliminadosEstaVuelta > 0) {
          this.log(`✅ ${eliminadosEstaVuelta} mensaje(s) de entrada eliminado(s) en ${channelId}`);
          totalEliminados += eliminadosEstaVuelta;
        }
      } catch (err) {
        console.error(`❌ Error limpiando canal ${channelId}: ${err.message}`);
      }

      // Pausa entre canales
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return totalEliminados;
  }

  /**
   * Limpia todos los mensajes EXCEPTO los del bot y del propietario
   * Borra mensajes de otros usuarios Y service messages del sistema
   * @param {number} ownerUserId - ID de Telegram del dueño del canal
   * @returns {Promise<number>} Cantidad de mensajes eliminados
   */
  async clearNonBotNonOwnerMessages(ownerUserId) {
    if (!this.enabled || this.channels.length === 0) {
      console.error('❌ Telegram no configurado');
      return 0;
    }

    if (!ownerUserId) {
      console.error('❌ Debes pasar tu ID de Telegram. Úsalo así: clearNonBotNonOwnerMessages(123456789)');
      return 0;
    }

    // Primero, obtener la información del bot para conocer su user_id
    let botUserId = null;
    try {
      const meResponse = await axios.get(`${this.apiUrl}/getMe`, {
        timeout: 10000,
      });
      
      if (meResponse.data.ok && meResponse.data.result.id) {
        botUserId = meResponse.data.result.id;
        console.log(`✅ ID del bot: ${botUserId}`);
        console.log(`✅ ID del propietario: ${ownerUserId}`);
      }
    } catch (err) {
      console.error(`❌ Error obteniendo info del bot: ${err.message}`);
      return 0;
    }

    let totalEliminados = 0;

    for (const channelId of this.channels) {
      try {
        console.log(`🧹 Limpiando canal ${channelId}...`);
        console.log(`   (Manteniendo: bot + propietario | Eliminando: otros usuarios + service messages)\n`);

        // Obtener los últimos 100 mensajes del canal
        const response = await axios.post(`${this.apiUrl}/getUpdates`, {
          limit: 100,
          timeout: 10,
        }, {
          timeout: 15000,
        });

        if (!response.data.ok || !response.data.result) {
          console.error(`⚠️ No se pudieron obtener mensajes del canal ${channelId}`);
          continue;
        }

        const updates = response.data.result;
        let eliminadosEstaVuelta = 0;

        // Filtrar updates que tengan mensajes y procesarlos en orden inverso (más recientes primero)
        const messages = updates
          .filter(u => u.message)
          .sort((a, b) => b.message.message_id - a.message.message_id);

        for (const update of messages) {
          const msg = update.message;
          let debeEliminarse = false;
          let razonEliminacion = '';

          // Detectar service messages (mensajes del sistema)
          if (this.isServiceMessage(msg)) {
            debeEliminarse = true;
            razonEliminacion = 'Service Message (mensaje del sistema)';
          }
          // Detectar mensajes de otros usuarios (no bot, no propietario)
          else if (msg.from && msg.from.id !== botUserId && msg.from.id !== ownerUserId) {
            debeEliminarse = true;
            razonEliminacion = `Mensaje de ${msg.from.first_name || msg.from.username || `usuario ${msg.from.id}`}`;
          }

          if (debeEliminarse) {
            try {
              // Intentar eliminar el mensaje
              const deleteResponse = await axios.post(`${this.apiUrl}/deleteMessage`, {
                chat_id: channelId,
                message_id: msg.message_id,
              }, {
                timeout: 10000,
              });

              if (deleteResponse.data.ok) {
                eliminadosEstaVuelta++;
                console.log(`   ✅ Eliminado: ${razonEliminacion}`);
                
                // Pequeña pausa entre eliminaciones
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (delErr) {
              // Ignorar errores de eliminación (pueden ser permisos o mensajes ya eliminados)
              if (delErr.response?.status !== 400) {
                this.log(`   ⚠️ Error al eliminar mensaje ${msg.message_id}: ${delErr.message}`);
              }
            }
          }
        }

        if (eliminadosEstaVuelta > 0) {
          console.log(`\n✅ ${eliminadosEstaVuelta} mensaje(s) eliminado(s) en ${channelId}`);
          totalEliminados += eliminadosEstaVuelta;
        } else {
          console.log(`✅ El canal ${channelId} está limpio\n`);
        }
      } catch (err) {
        console.error(`❌ Error limpiando canal ${channelId}: ${err.message}`);
      }

      // Pausa entre canales
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n🎉 Total de mensajes eliminados: ${totalEliminados}`);
    return totalEliminados;
  }

  /**
   * Detecta si un mensaje es un "Service Message" (mensaje del sistema)
   * @param {object} msg - Objeto de mensaje de Telegram
   * @returns {boolean} true si es un service message
   */
  isServiceMessage(msg) {
    // Mensajes de usuarios que se unieron/salieron
    if (msg.new_chat_members || msg.left_chat_member) return true;
    
    // Cambios de grupo/canal
    if (msg.new_chat_title || msg.delete_chat_photo || msg.new_chat_photo) return true;
    if (msg.group_chat_created || msg.supergroup_chat_created || msg.channel_chat_created) return true;
    
    // Cambios de permisos y configuración
    if (msg.pinned_message) return true;
    if (msg.migrate_to_chat_id || msg.migrate_from_chat_id) return true;
    
    // Avatares de grupos
    if (msg.chat_shared) return true;
    
    // Pago/Transacciones
    if (msg.successful_payment || msg.invoice) return true;
    
    // Invitaciones/Links
    if (msg.video_chat_started || msg.video_chat_ended) return true;
    if (msg.video_chat_participants_invited) return true;
    
    // Reacciones automáticas
    if (msg.forum_topic_created || msg.forum_topic_edited || msg.forum_topic_closed) return true;
    if (msg.forum_topic_reopened) return true;
    
    // Web app share
    if (msg.web_app_data) return true;
    
    // Link a servidor privado
    if (msg.proximity_alert_triggered) return true;
    
    // Cambios de permisos de usuario
    if (msg.user_shared) return true;
    
    // Sin contenido visible (ejemplo: solo forwarded con cambios)
    if (!msg.text && !msg.caption && !msg.photo && !msg.video && 
        !msg.audio && !msg.document && !msg.animation && !msg.voice &&
        !msg.video_note && !msg.contact && !msg.location && !msg.venue &&
        !msg.sticker && !msg.dice && !msg.game && !msg.poll &&
        !msg.forward_from && !msg.forward_from_chat && !msg.reply_to_message &&
        !msg.edit_date) {
      // Es un service message sin contenido identificable
      return true;
    }
    
    return false;
  }
}

export default new TelegramManager();
