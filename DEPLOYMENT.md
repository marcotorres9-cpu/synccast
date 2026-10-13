# SyncCast - Guía de Despliegue en Vercel

Esta guía te explica cómo desplegar SyncCast en Vercel para tener un dominio público y poder descargar el APK desde internet.

## ⚠️ IMPORTANTE: Seguridad

Si compartiste credenciales de Vercel en chats públicos:
1. Ve a https://vercel.com/account/tokens
2. Revoca TODOS los tokens existentes
3. Crea un nuevo token solo cuando lo necesites

**Nunca compartas tokens en chats públicos.**

## Arquitectura

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Teléfono        │     │  Vercel          │     │  WebSocket Service │
│  (APK Android)   │ ←─→ │  (Next.js app)   │ ←─→ │  (Railway/Render)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        ↑                        ↑                        ↑
        │                        │                        │
   Controla la          Sirve la web + APK        Sincronización
   reproducción         + API de archivos          en tiempo real
```

### Por qué 2 servicios

- **Vercel**: Perfecto para servir la página web, el APK, y APIs REST. **No soporta WebSockets long-running**.
- **Railway / Render / Fly.io**: Necesario para el servicio WebSocket (`mini-services/sync-service`) que maneja la sincronización en tiempo real entre el teléfono y los TVs.

## Despliegue paso a paso

### 1. Instalar Vercel CLI

```bash
npm install -g vercel
vercel login  # Sigue las instrucciones en el navegador
```

### 2. Desplegar el frontend a Vercel

```bash
cd /home/z/my-project
./scripts/deploy-vercel.sh
```

O manualmente:

```bash
vercel --prod
```

Anota la URL que te da Vercel (ej. `https://synccast-abc123.vercel.app`).

### 3. Desplegar el WebSocket Service en Railway

1. Ve a https://railway.app
2. Crea una cuenta y un nuevo proyecto
3. "Deploy from GitHub repo" → sube tu repo de SyncCast
4. Configura:
   - **Root Directory**: `mini-services/sync-service`
   - **Build Command**: `bun install`
   - **Start Command**: `bun run index.ts`
   - **Port**: 3003 (Railway lo expone automáticamente)
5. Railway te dará una URL pública como `wss://synccast-sync.up.railway.app`

### 4. Configurar CORS en el WebSocket Service

Edita `mini-services/sync-service/index.ts`:

```typescript
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: [
      'https://synccast-abc123.vercel.app',  // Tu URL de Vercel
      'http://localhost:3000'  // Para desarrollo local
    ],
    methods: ['GET', 'POST']
  },
  // ...
})
```

### 5. Actualizar la app para usar URLs separadas

Cuando tengas ambas URLs, modifica `src/lib/server-url.ts`:

```typescript
export function getSocketUrl(): string {
  // Vercel no soporta WebSockets, conectamos al servicio en Railway
  const socketServer = 'https://synccast-sync.up.railway.app'
  return `${socketServer}/?XTransformPort=3003`
}
```

Y reconstruye el APK:

```bash
./scripts/build-apk.sh
```

## URLs finales

Una vez desplegado, tendrás:

- **Página de descarga del APK**: `https://tu-app.vercel.app/download`
- **App principal**: `https://tu-app.vercel.app`
- **APK directo**: `https://tu-app.vercel.app/downloads/SyncCast-v1.0.apk`
- **WebSocket service**: `wss://tu-app.up.railway.app` (Railway)

## Configuración en el APK

Cuando abras el APK por primera vez, te pedirá la URL del servidor. Ingresa:

```
https://tu-app.vercel.app
```

La app automáticamente usará este servidor para:
- Subir y descargar archivos multimedia
- Conectar los TVs (los TVs abren esta URL en su navegador)
- Sincronizar reproducción vía WebSocket

## Alternativas a Railway para WebSocket

Si prefieres no usar Railway, puedes usar:

- **Render**: https://render.com (free tier soporta WebSockets)
- **Fly.io**: https://fly.io (free tier con 3 VMs pequeñas)
- **Cloudflare Workers + Durable Objects**: más complejo pero global
- **Pusher**: servicio gestionado de WebSocket (paid)
- **Socket.io Cloud**: servicio oficial (paid)

## Variables de entorno

Si necesitas configurar algo específico, crea un archivo `.env.production`:

```
NEXT_PUBLIC_SOCKET_URL=https://tu-app.up.railway.app
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
```

Y úsalas en `src/lib/server-url.ts`:

```typescript
export function getSocketUrl(): string {
  return process.env.NEXT_PUBLIC_SOCKET_URL || '/?XTransformPort=3003'
}
```

## Comandos útiles

```bash
# Build APK
./scripts/build-apk.sh

# Deploy a Vercel
./scripts/deploy-vercel.sh

# Desarrollo local
bun run dev

# Lint
bun run lint

# Prisma
bun run db:push
```

## Soporte

Si tienes problemas:
1. Verifica que el servidor de Vercel está respondiendo: `curl https://tu-app.vercel.app/api/media`
2. Verifica que el WebSocket service está corriendo: `curl https://tu-app.up.railway.app/socket.io/?EIO=4&transport=polling`
3. Asegúrate de que los TVs y el teléfono apuntan a la misma URL de Vercel
4. Revisa la consola del navegador del TV para ver errores de CORS
