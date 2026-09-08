# İdrak Liseyi - Agora Token Server

Secure Agora RTC token generation server for İdrak Liseyi Meet feature.

## 🚀 Render.com Deployment

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with GitHub

### 2. Create New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Select this directory: `agora-token-server`

### 3. Configure Service

**Basic Settings:**
- **Name:** `idrak-agora-token`
- **Region:** Frankfurt (EU Central)
- **Branch:** `main`
- **Root Directory:** `agora-token-server`
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`

**Environment Variables:**
Add these in Render dashboard:
```
AGORA_APP_ID=045bdb3866464fb6b47009e8044ce57e
AGORA_APP_CERTIFICATE=0d55f75c1a5a48968ca941e880231003
```

**Plan:** Free (automatic sleep after 15 min inactivity)

### 4. Deploy
Click "Create Web Service" - Render will auto-deploy!

## 📡 API Endpoints

### `GET /`
Health check
```bash
curl https://idrak-agora-token.onrender.com/
```

### `POST /generate-token`
Generate Agora RTC token
```bash
curl -X POST https://idrak-agora-token.onrender.com/generate-token \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "meet-123456",
    "userId": "usr-teacher-1"
  }'
```

**Response:**
```json
{
  "token": "007eJxT...",
  "uid": 1245259541,
  "expiresAt": 1788860127,
  "channelName": "meet-123456"
}
```

## 🧪 Local Testing

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start server
npm run dev
```

Server runs on `http://localhost:3000`

## 🔐 Security Notes

- App Certificate is ONLY on server - never exposed to client
- Tokens expire after 1 hour
- CORS enabled for Flutter app requests
