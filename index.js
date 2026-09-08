const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment variables
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// In-Memory Active Meeting Rooms Storage
// roomId -> { roomId, title, hostName, allowGuestLink, guestLimit, guestCount, status, hasVideo, createdAt }
const activeRooms = new Map();

// Dart tərəfindəki uidFromUserId ilə eyni alqoritm
function uidFromUserId(userId) {
  const hash = crypto.createHash('sha256');
  hash.update(`idrak-meet|${userId}`);
  const digest = hash.digest();
  return (digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) & 0x7fffffff;
}

// Generate token helper
function generateToken(channelName, uid) {
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    throw new Error('AGORA_APP_ID və ya AGORA_APP_CERTIFICATE təyin olunmayıb');
  }
  const expireTimeInSeconds = 3600; // 1 saat
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = currentTimestamp + expireTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpireTs
  );

  return { token, expiresAt: privilegeExpireTs };
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'İdrak Liseyi Agora Token & WebRTC Gateway Server',
    version: '2.0.0',
    activeRooms: activeRooms.size,
  });
});

// ──────────────────────────────────────────────
// 1. Generate Agora RTC Token (Mobile App API)
// ──────────────────────────────────────────────
app.post('/generate-token', (req, res) => {
  try {
    const { channelName, userId } = req.body;

    if (!channelName || !userId) {
      return res.status(400).json({ error: 'channelName və userId məcburidir' });
    }

    const uid = uidFromUserId(userId);
    const { token, expiresAt } = generateToken(channelName, uid);

    console.log(`✅ Token yaradıldı (Mobil): channel=${channelName}, user=${userId}, uid=${uid}`);

    res.json({
      token,
      uid,
      expiresAt,
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

// ──────────────────────────────────────────────
// 2. Room Lifecycle & Guest Management APIs
// ──────────────────────────────────────────────

// Register created room from Flutter app
app.post('/api/rooms/register', (req, res) => {
  const { roomId, title, hostName, allowGuestLink, guestLimit, hasVideo } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: 'roomId məcburidir' });
  }

  activeRooms.set(roomId, {
    roomId,
    title: title || 'İdrak Liseyi Canlı Görüş',
    hostName: hostName || 'Müəllim',
    allowGuestLink: allowGuestLink ?? true,
    guestLimit: guestLimit != null ? Number(guestLimit) : 10,
    guestCount: 0,
    status: 'active',
    hasVideo: hasVideo ?? true,
    createdAt: Date.now(),
  });

  console.log(`📡 Otaq qeydiyyata alındı: ${roomId} (Limit: ${guestLimit})`);
  res.json({ success: true, roomId });
});

// End / destroy room from Flutter host
app.post('/api/rooms/end', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId məcburidir' });

  const room = activeRooms.get(roomId);
  if (room) {
    room.status = 'ended';
    room.endedAt = Date.now();
    console.log(`🛑 Otaq sonlandırıldı və link məhv edildi (Destroy): ${roomId}`);
  } else {
    activeRooms.set(roomId, {
      roomId,
      status: 'ended',
      endedAt: Date.now(),
    });
    console.log(`🛑 Otaq qeyd edildi və sonlandırıldı: ${roomId}`);
  }

  res.json({ success: true, message: 'Otaq və qonaq linki uğurla məhv edildi' });
});

// Check room status
app.get('/api/rooms/:roomId/status', (req, res) => {
  const { roomId } = req.params;
  const room = activeRooms.get(roomId);

  if (!room || room.status !== 'active') {
    return res.status(403).json({
      exists: Boolean(room),
      active: false,
      error: 'Bu görüşmə başa çatıb və ya link etibarsızdır.',
    });
  }

  res.json({
    exists: true,
    active: true,
    title: room.title,
    hostName: room.hostName,
    allowGuestLink: room.allowGuestLink,
    guestLimit: room.guestLimit,
    guestCount: room.guestCount,
    hasVideo: room.hasVideo,
  });
});

// Web Guest Join Endpoint
app.post('/api/rooms/:roomId/join-guest', (req, res) => {
  try {
    const { roomId } = req.params;
    const { guestName } = req.body;

    if (!guestName) {
      return res.status(400).json({ error: 'Qonaq adı daxil edilməlidir' });
    }

    const room = activeRooms.get(roomId);
    if (!room || room.status !== 'active') {
      return res.status(403).json({ error: 'Bu görüşmə artıq başa çatıb və link etibarsızdır.' });
    }

    if (!room.allowGuestLink) {
      return res.status(403).json({ error: 'Bu görüşmə üçün qonaq girişi qapalıdır.' });
    }

    if (room.guestLimit > 0 && room.guestCount >= room.guestLimit) {
      return res.status(403).json({ error: `Qonaq iştirakçı limiti dolub (Maksimum: ${room.guestLimit} nəfər).` });
    }

    // Generate unique guest UID
    const guestUid = Math.floor(100000 + Math.random() * 899999);
    const { token, expiresAt } = generateToken(roomId, guestUid);

    room.guestCount += 1;
    console.log(`👤 Qonaq qoşuldu: ${guestName} (UID: ${guestUid}) -> Otaq: ${roomId} (Cəmi qonaq: ${room.guestCount})`);

    res.json({
      appId: AGORA_APP_ID,
      channelName: roomId,
      token,
      uid: guestUid,
      guestName,
      expiresAt,
    });
  } catch (error) {
    console.error('❌ Qonaq qoşulma xətası:', error);
    res.status(500).json({ error: 'Qoşulma xətası: ' + error.message });
  }
});

// Web Guest Leave Endpoint
app.post('/api/rooms/:roomId/leave-guest', (req, res) => {
  const { roomId } = req.params;
  const room = activeRooms.get(roomId);
  if (room && room.guestCount > 0) {
    room.guestCount -= 1;
    console.log(`👋 Qonaq ayrıldı -> Otaq: ${roomId} (Qalan qonaq: ${room.guestCount})`);
  }
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// 3. WebRTC Guest Join Page Routes
// ──────────────────────────────────────────────
app.get('/join/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/meet/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Agora Token & WebRTC Gateway Server çalışır: http://localhost:${PORT}`);
  console.log(`📝 APP_ID: ${AGORA_APP_ID ? '✓ Tanımlı' : '✗ EKSIK!'}`);
  console.log(`🔐 APP_CERTIFICATE: ${AGORA_APP_CERTIFICATE ? '✓ Tanımlı' : '✗ EKSIK!'}`);
});
