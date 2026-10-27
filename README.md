# Galería del evento

Los invitados escanean un QR y suben fotos desde el celular, sin descargar nada ni crear cuenta. El anfitrión las ve al instante, las modera y se las lleva todas.

**Incluye:**

- Login del anfitrión con link por email y creación de eventos con QR.
- Subida de fotos desde el celular, sin app ni registro, con compresión y reintentos.
- Galería en tiempo real, moderación (ocultar, mostrar y borrar con selección múltiple) y borrado del evento completo.
- Descarga de todas las fotos en .zip (en partes de 150 fotos).
- Pantalla del salón con link propio: carrusel de fotos nuevas y QR.
- Trivia de la pareja en vivo: editor de preguntas, control del anfitrión, juego en el celular y ranking en la pantalla.
- Tarjetas de mesa con el QR para imprimir o guardar en PDF (4 por hoja A4).

Pendiente: cobro con Mercado Pago.

## Cómo está armado

| Pieza | Dónde vive | Para qué |
| --- | --- | --- |
| Web (React + Vite, sitio estático) | Hostinger, en un subdominio | Lo que ven invitados y anfitriones |
| Base de datos, login y tiempo real | Supabase | Eventos, invitados, fotos y reglas de seguridad |
| Funciones `sign-upload` y `borrar` | Supabase Edge Functions | Firman cada subida y borran fotos o eventos de R2 |
| Fotos y miniaturas | Cloudflare R2 | Almacenamiento sin costo por descargas |

Las fotos se comprimen en el celular y van directo a R2: nunca pasan por Hostinger ni por Supabase.

## Puesta en marcha (una sola vez)

Seguí los pasos en orden. Ninguna clave se escribe en el código: todas van como secretos de GitHub.

### 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) con esta configuración:
   - **GitHub:** sin conectar (el despliegue lo hace este repo).
   - **Database password:** generala y guardala; no se puede volver a ver.
   - **Region:** South America (São Paulo).
   - **Enable Data API:** activado.
   - **Automatically expose new tables:** desactivado. Los permisos los da la migración `20261026000000_permisos.sql`.
   - **Enable automatic RLS:** activado.
2. En **Authentication → Sign In / Providers**, activá **Allow anonymous sign-ins** (así entran los invitados sin cuenta). El login por email ya viene activo.
3. En **Authentication → URL Configuration**:
   - **Site URL:** `https://fotos.tudominio.com` (tu subdominio).
   - **Redirect URLs:** agregá `https://fotos.tudominio.com/panel`.
4. Anotá estos datos:
   - **Project ref:** el código que aparece en la URL del proyecto (`supabase.com/dashboard/project/ESTE-CODIGO`).
   - **Project URL:** en **Project Settings → Data API** (tiene la forma `https://xxxx.supabase.co`).
   - **Publishable key:** en **Project Settings → API Keys** (empieza con `sb_publishable_`). La *secret key* no hace falta copiarla: Supabase se la da sola a la función.
5. Creá un **token de acceso** en tu cuenta: avatar → **Account → Access Tokens → Generate new token**.

### 2. Cloudflare R2

1. En el panel de Cloudflare, entrá a **R2** y creá un bucket llamado `galeria-eventos`.
2. Hacelo legible desde internet (las fotos se muestran desde ahí):
   - **Para probar:** en el bucket, **Settings → Public access → R2.dev subdomain → Allow**. Anotá la URL `https://pub-....r2.dev`.
   - **Para producción:** conectá un dominio propio (por ejemplo `fotos-cdn.tudominio.com`) en **Settings → Custom Domains**. Requiere que el dominio use los DNS de Cloudflare.
3. En **Settings → CORS policy**, pegá esto (cambiá el dominio por el tuyo):

   ```json
   [
     {
       "AllowedOrigins": ["https://fotos.tudominio.com", "http://localhost:5173"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. En **R2 → Manage R2 API Tokens → Create API token**: permiso **Object Read & Write**, solo para el bucket `galeria-eventos`. Anotá el **Access Key ID**, el **Secret Access Key** y tu **Account ID** (aparece en la página de R2).

### 3. Hostinger

1. En hPanel, entrá a **Dominios → Subdominios** y creá `fotos` (o el nombre que prefieras). Anotá la carpeta que te asigna.
2. En **Archivos → Cuentas FTP**, anotá el **servidor (IP o host)**, el **usuario** y la **contraseña** (podés crear una cuenta FTP nueva solo para esto).
3. Activá el **SSL** del subdominio en **Seguridad → SSL**.

### 4. Secretos en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Cargá uno por uno:

| Secreto | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key de Supabase (`sb_publishable_...`) |
| `VITE_R2_PUBLIC_URL` | URL pública del bucket, sin barra final |
| `SUPABASE_ACCESS_TOKEN` | Token de acceso de tu cuenta de Supabase |
| `SUPABASE_PROJECT_REF` | Project ref |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base de datos |
| `R2_ACCOUNT_ID` | Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key ID del token de R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token de R2 |
| `R2_BUCKET` | `galeria-eventos` |
| `ALLOWED_ORIGIN` | `https://fotos.tudominio.com` |
| `FTP_SERVER` | Servidor FTP de Hostinger |
| `FTP_USERNAME` | Usuario FTP |
| `FTP_PASSWORD` | Contraseña FTP |
| `FTP_DIR` | Carpeta del subdominio, terminada en `/` (por ejemplo `/domains/tudominio.com/public_html/fotos/`) |

> Las claves que empiezan con `VITE_` quedan visibles en la web publicada; eso es normal y seguro, porque la publishable key no da permisos por sí sola: las reglas de seguridad de la base deciden qué puede hacer cada uno. Las demás nunca salen de GitHub y Supabase.

### 5. Primer despliegue

En la pestaña **Actions** del repo:

1. Abrí **Supabase → Run workflow**. Crea las tablas, carga las claves de R2 y publica la función de subida.
2. Abrí **Web → Run workflow**. Compila la web y la sube a Hostinger.

Desde ahí, cada cambio que se sube a `main` se publica solo.

## Probarlo

1. Entrá a `https://fotos.tudominio.com/entrar`, poné tu email y abrí el link que te llega.
2. Creá un evento y escaneá el QR con el celular.
3. Poné tu nombre, subí fotos y miralas aparecer en el panel.

## Verificación automática

Cada cambio corre en GitHub:

- **Web:** verificación de tipos y compilación.
- **Base de datos:** aplica las migraciones en un Postgres de prueba y corre `supabase/tests/reglas.sql` (seguridad de fotos, pantalla y trivia: quién ve qué, quién puede moderar y que la respuesta correcta no se filtre antes de tiempo).
- **Funciones:** verifica los tipos de cada función de Supabase.

## Desarrollo en tu compu (opcional)

```bash
cp .env.example .env.local   # completá los valores
npm install
npm run dev
```

## Notas de esta fase

- Los eventos nacen **activos** para poder probar. Cuando se sume el cobro (semanas 5 y 6), van a nacer en borrador hasta que se pague.
- Una subida que se corta a mitad de camino deja una fila "pendiente" que no se muestra; más adelante una tarea programada las va a limpiar.
- Las fotos HEIC de iPhone se convierten solas al elegirlas desde Safari. En Chrome de escritorio no se pueden leer y se marcan con error.

## Administración de transferencias

La pantalla administrativa está en `/panel/administracion/transferencias`. Para autorizarla, configurá el secreto `TRANSFER_ADMIN_EMAILS` en Supabase con los emails exactos de las cuentas administradoras, separados por coma. La función vuelve a validar la sesión y el email desde Supabase Auth en cada consulta y confirmación; ocultar o alterar la pantalla no concede permisos. Sin el secreto configurado, la función rechaza el acceso.
