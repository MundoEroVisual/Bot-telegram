import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.CUTY_TOKEN;
const apiUrl = process.env.CUTY_API_URL;

console.log('🔧 Probando API Cuty.io...');
console.log(`Token: ${token ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`API URL: ${apiUrl}`);

const testUrls = [
  'https://pixeldrain.com/u/cjbnmq3R',
  'https://www.mediafire.com/file_premium/3ip1zseacgouike/familiarcircumstances.hotzone18.com-release.apk/file',
];

async function testShorten(url) {
  try {
    console.log(`\n🔗 Acortando: ${url.substring(0, 50)}...`);
    const response = await axios.get(apiUrl, {
      params: {
        token: token,
        url: encodeURIComponent(url),
      },
      timeout: 10000
    });

    console.log(`📊 Respuesta completa:`, response.data);
    
    const shortenedUrl = response.data.short_url || response.data.url || response.data.shortenedUrl;
    if (shortenedUrl) {
      console.log(`✅ URL acortada: ${shortenedUrl}`);
      return shortenedUrl;
    } else {
      console.log(`⚠️ Respuesta inesperada`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Data:`, err.response.data);
    }
    return null;
  }
}

async function runTests() {
  for (const url of testUrls) {
    await testShorten(url);
  }
}

runTests();
