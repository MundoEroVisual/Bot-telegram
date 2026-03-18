import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  // Configuración HotZone18
  hotzone: {
    baseUrl: 'https://www.hotzone18.com',
    username: process.env.HOTZONE_USER || '',
    password: process.env.HOTZONE_PASS || '',
    maxNovelas: parseInt(process.env.MAX_NOVELAS || '12', 10),
    requestDelay: parseInt(process.env.REQUEST_DELAY || '1000', 10),
  },

  // Configuración de directorios
  paths: {
    root: __dirname,
    dataDir: path.join(__dirname, process.env.DATA_DIR || 'data'),
    imagesDir: path.join(__dirname, process.env.IMAGES_DIR || 'data/images'),
    novelasJson: path.join(__dirname, process.env.DATA_DIR || 'data', 'novelas.json'),
    logsDir: path.join(__dirname, 'logs'),
  },

  // Configuración GitHub (opcional)
  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
    enabled: !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO),
  },

  // Configuración de automatización
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 */6 * * *',
    enabled: true,
  },

  // Configuración Cuty.io (acortador de URLs para android_vip)
  cuty: {
    token: process.env.CUTY_TOKEN || '',
    apiUrl: process.env.CUTY_API_URL || 'https://api.cuty.io/quick',
    enabled: !!process.env.CUTY_TOKEN,
  },

  // Configuración Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    channels: (process.env.TELEGRAM_CHANNELS || '').split(',').filter(c => c.trim()).map(c => c.trim()),
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNELS),
  },

  // URL base para novelas (para generar enlaces web)
  webBaseUrl: process.env.WEB_BASE_URL || 'https://eroverse.onrender.com/novela.html?id=',

  // Configuración Discord
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    channels: (process.env.DISCORD_CHANNELS || '').split(',').filter(c => c.trim()).map(c => c.trim()),
    enabled: !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNELS),
  },

  // Configuración del propietario (para comandos en Telegram)
  owner: {
    telegramUserId: process.env.OWNER_TELEGRAM_ID ? parseInt(process.env.OWNER_TELEGRAM_ID) : null,
  },

  // Otros
  debug: process.env.DEBUG === 'true',
};
