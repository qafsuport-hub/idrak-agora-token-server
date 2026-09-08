const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Dart tarafındaki uidFromUserId ile BİREBİR aynı algoritma
function uidFromUserId(userId) {
  const hash = crypto.createHash('sha256');
  hash.update(`idrak-meet|${userId}`);
  const digest = hash.digest();
  
  return (digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) & 0x7fffffff;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'İdrak Liseyi Agora Token Server',
    version: '1.0.0',
  });
});

// Generate Agora RTC Token
app.post('/generate-token', (req, res) => {
  try {
    const { channelName, userId } = req.body;

    // Validate parameters
    if (!channelName || !userId) {
      return res.status(400).json({
        error: 'channelName və userId zorunludur',
      });
    }

    // Check environment variables
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.error('❌ AGORA_APP_ID və ya AGORA_APP_CERTIFICATE tanımlanmayıb!');
      return res.status(500).json({
        error: 'Server configuration error',
      });
    }

    const uid = uidFromUserId(userId);
    const expireTimeInSeconds = 3600; // 1 saat
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTimestamp + expireTimeInSeconds;

    // Generate token with Agora's official library
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpireTs
    );

    console.log(`✅ Token yaradıldı: channel=${channelName}, user=${userId}, uid=${uid}`);

    res.json({
      token,
      uid,
      expiresAt: privilegeExpireTs,
      channelName,
    });
  } catch (error) {
    console.error('❌ Token yaratma xətası:', error);
    res.status(500).json({
      error: 'Token yaradılarkən xəta baş verdi',
      details: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Agora Token Server çalışır: http://localhost:${PORT}`);
  console.log(`📝 APP_ID: ${AGORA_APP_ID ? '✓ Tanımlı' : '✗ EKSIK!'}`);
  console.log(`🔐 APP_CERTIFICATE: ${AGORA_APP_CERTIFICATE ? '✓ Tanımlı' : '✗ EKSIK!'}`);
});
