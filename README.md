# Galería del evento

Los invitados escanean un QR y suben fotos desde el celular, sin descargar nada ni crear cuenta. El anfitrión las ve al instante, las modera y se las lleva todas.

**Incluye:**

- Compra online: galería, invitación digital o las dos, con Mercado Pago o transferencia bancaria (alias).
- Ficha del evento que completa el cliente después de comprar, y administración de pedidos para NewTech.
- Cuenta del anfitrión con contraseña o link por email; la galería con su QR se activa al confirmarse el pago.
- Subida de fotos desde el celular, sin app ni registro, con compresión y reintentos.
- Galería en tiempo real, moderación (ocultar, mostrar y borrar con selección múltiple) y borrado del evento completo.
- Descarga de todas las fotos en .zip (en partes de 150 fotos).
- Pantalla del salón con link propio: carrusel de fotos nuevas y QR.
- Trivia de la pareja en vivo: editor de preguntas, control del anfitrión, juego en el celular y ranking en la pantalla.
- Tarjetas de mesa con el QR para imprimir o guardar en PDF (4 por hoja A4).

## Cómo está armado

| Pieza | Dónde vive | Para qué |
| --- | --- | --- |
| Web (React + Vite, sitio estático) | Hostinger, en un subdominio | Lo que ven invitados y anfitriones |
| Base de datos, login y tiempo real | Supabase | Eventos, invitados, fotos y reglas de seguridad |
| Funciones (`supabase/functions`) | Supabase Edge Functions | Subidas y borrado en R2, cobros, ficha, administración y avisos |
| Pagos | Mercado Pago (Checkout Pro) y transferencia | Mercado Pago avisa al webhook; las transferencias las confirma NewTech |
| Correos | Resend | Avisos de compra, transferencia, ficha e invitación lista |
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
| `MP_ACCESS_TOKEN` | Access token de producción de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Clave secreta del webhook de Mercado Pago (obligatoria: sin ella se rechazan los avisos) |
| `RESEND_API_KEY` | Clave de Resend (`re_...`) para enviar correos |
| `EMAIL_DESDE` | Remitente verificado en Resend, por ejemplo `NewTech <avisos@tudominio.com>` |
| `ADMIN_EMAIL` | Email que recibe los avisos internos (compras, transferencias, fichas) |
| `WHATSAPP_NUMERO` | WhatsApp de atención, solo dígitos con código de país |
| `TRANSFER_ADMIN_EMAILS` | Emails de las cuentas que administran pedidos, separados por coma |
| `TRANSFER_ALIAS` | Alias (o CBU/CVU) donde se reciben las transferencias |
| `INVITACIONES_WORDPRESS_SECRET` | Secreto compartido con el plugin de invitaciones (`ga_checkout_secret` de WordPress) |
| `INVITACIONES_WORDPRESS_URL` | Opcional. Sitio de invitaciones; por defecto `https://invitaciones.newtech.net.ar` |

En Mercado Pago, el webhook (modo productivo, evento **Pagos**) va a `https://TU-PROJECT-REF.supabase.co/functions/v1/mp-webhook`.

> Las claves que empiezan con `VITE_` quedan visibles en la web publicada; eso es normal y seguro, porque la publishable key no da permisos por sí sola: las reglas de seguridad de la base deciden qué puede hacer cada uno. Las demás nunca salen de GitHub y Supabase.

### 5. Primer despliegue

En la pestaña **Actions** del repo:

1. Abrí **Supabase → Run workflow**. Crea las tablas, carga las claves y publica las funciones.
2. Abrí **Web → Run workflow**. Compila la web y la sube a Hostinger.

Desde ahí, cada cambio que se sube a `main` se publica solo.

## Probarlo

1. Entrá a `https://fotos.tudominio.com/contratar`, elegí un pack y pagá por transferencia (o con Mercado Pago).
2. Con una cuenta de `TRANSFER_ADMIN_EMAILS`, confirmá la transferencia en `/panel/administracion`.
3. Abrí la galería desde **Mis eventos**, escaneá el QR con el celular, subí fotos y miralas aparecer en el panel.

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

## Notas

- Las galerías nacen en **borrador** y se activan solas cuando se confirma el pago. La mejora de pack de una galería activa (se paga la diferencia) también es un pedido: Mercado Pago o transferencia, y si pasa a Completo el cliente recibe la ficha de invitación.
- Una subida que se corta a mitad de camino deja una fila "pendiente" que no se muestra; más adelante una tarea programada las va a limpiar.
- Las fotos HEIC de iPhone se convierten solas al elegirlas desde Safari. En Chrome de escritorio no se pueden leer y se marcan con error.

## Pedidos y administración

1. El cliente compra en `/contratar`. Se crea el pedido (`compras`) y, si incluye galería, una galería en borrador.
2. Con Mercado Pago, el webhook confirma el pago y activa la galería. Con transferencia, NewTech confirma la acreditación en `/panel/administracion`.
3. Si el pedido incluye invitación, el cliente completa la ficha en `/panel/compra/<id>`; al enviarla llega un correo a `ADMIN_EMAIL` con todos los datos.
4. Con el pago confirmado y la ficha completa, la galería le pide a WordPress el borrador de la invitación (importador `ga/v1/integration/purchase`) y el pedido pasa a **en preparación**. Si falla, se reintenta desde `/panel/administracion`.
5. La invitación se termina y se activa en WordPress. La entrega (URL final, estado **entregada** y correo al cliente) la registra el complemento de WordPress por el puente, o NewTech a mano en `/panel/administracion`. El correo sale una sola vez por URL.

### Puente con WordPress (`wp-bridge`)

Función `https://TU-PROJECT-REF.supabase.co/functions/v1/wp-bridge`, para el complemento GA Checkout Bridge. Cada pedido se firma con `INVITACIONES_WORDPRESS_SECRET`: cabeceras `X-GA-Timestamp` (epoch de 10 dígitos, ±300 s) y `X-GA-Signature` (HMAC-SHA256 hex de `timestamp + "." + cuerpo crudo`). WordPress nunca recibe claves de Supabase.

| Ruta | Qué hace |
| --- | --- |
| `POST /v1/orders/list` | Pedidos `pagada`/`preparando` con ficha completa, invitación y sin vínculo con WordPress. Paginado con `cursor` (máx. 100). |
| `POST /v1/orders/{id}/preparing` | Vincula `wordpress_event_id` y `wordpress_url`, y pasa el pedido a `preparando`. Idempotente. |
| `POST /v1/orders/{id}/delivered` | Guarda la URL pública, pasa a `entregada` y avisa al cliente una vez. Otra URL distinta responde `409 url_conflict`. |

Los errores vienen como `{ "code", "message" }` (`invalid_request`, `invalid_signature`, `order_not_found`, `invalid_state`, `already_linked`, `url_conflict`, `incomplete_order`, `invitation_not_included`, `invalid_url`, `internal_error`, `temporarily_unavailable`).

La pantalla de administración solo aparece para los emails de `TRANSFER_ADMIN_EMAILS`, y la función `administrar-transferencias` vuelve a validar la sesión en cada llamada: ocultar o alterar la pantalla no concede permisos.
