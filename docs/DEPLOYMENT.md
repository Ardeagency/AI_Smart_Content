# Guía de Despliegue - UGC Studio

## 🚀 Despliegue en Producción

### Prerrequisitos

- Servidor con Node.js v14 o superior
- Base de datos Supabase configurada
- Dominio y certificado SSL
- Variables de entorno configuradas

### 1. Preparación del Servidor

#### Instalación de Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# macOS (con Homebrew)
brew install node
```

#### Instalación de PM2 (Process Manager)
```bash
npm install -g pm2
```

### 2. Configuración de Variables de Entorno

Crear archivo `.env` en el directorio raíz:

```env
# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_clave_anonima_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_clave_de_servicio_aqui

# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=https://tu-dominio.com

# Security
JWT_SECRET=tu_jwt_secret_muy_seguro
SESSION_SECRET=tu_session_secret_muy_seguro

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=/var/www/uploads

# Database
DATABASE_URL=postgresql://usuario:password@host:port/database

# Email (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_password_de_aplicacion
```

### 3. Configuración de Supabase

#### Crear Proyecto
1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Crear nuevo proyecto
3. Configurar región y contraseña de base de datos

#### Ejecutar Migraciones
```bash
# Conectar a la base de datos
psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Ejecutar scripts SQL en orden:
# 1. supabase-schema.sql
# 2. public-supabase.sql
# 3. oauth-supabase.sql
# 4. bucket.ugc-supabase.sql
# 5. setup-product-images-bucket.sql
```

#### Configurar Políticas de Seguridad
```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_content ENABLE ROW LEVEL SECURITY;

-- Política para brands
CREATE POLICY "Users can view own brands" ON brands
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brands" ON brands
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brands" ON brands
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brands" ON brands
  FOR DELETE USING (auth.uid() = user_id);
```

### 4. Despliegue de la Aplicación

#### Clonar Repositorio
```bash
cd /var/www
git clone https://github.com/tu-usuario/ugc-studio.git
cd ugc-studio
```

#### Instalar Dependencias
```bash
npm install --production
```

#### Configurar PM2
Crear archivo `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'ugc-studio',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/ugc-studio/error.log',
    out_file: '/var/log/ugc-studio/out.log',
    log_file: '/var/log/ugc-studio/combined.log',
    time: true
  }]
};
```

#### Iniciar Aplicación
```bash
# Crear directorio de logs
sudo mkdir -p /var/log/ugc-studio
sudo chown $USER:$USER /var/log/ugc-studio

# Iniciar con PM2
pm2 start ecosystem.config.js --env production

# Configurar PM2 para iniciar automáticamente
pm2 startup
pm2 save
```

### 5. Configuración de Nginx

#### Instalar Nginx
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### Configurar Virtual Host
Crear archivo `/etc/nginx/sites-available/ugc-studio`:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com www.tu-dominio.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Static Files
    location / {
        root /var/www/ugc-studio;
        try_files $uri $uri/ @backend;
    }

    # API Backend
    location @backend {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # File Upload Size
    client_max_body_size 10M;
}
```

#### Habilitar Sitio
```bash
sudo ln -s /etc/nginx/sites-available/ugc-studio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Configuración de SSL

#### Instalar Certbot
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

#### Obtener Certificado SSL
```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

### 7. Configuración de Firewall

#### UFW (Ubuntu)
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### Firewalld (CentOS/RHEL)
```bash
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 8. Monitoreo y Logs

#### Configurar Logrotate
Crear archivo `/etc/logrotate.d/ugc-studio`:

```
/var/log/ugc-studio/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

#### Monitoreo con PM2
```bash
# Ver estado de la aplicación
pm2 status

# Ver logs en tiempo real
pm2 logs ugc-studio

# Reiniciar aplicación
pm2 restart ugc-studio

# Ver métricas
pm2 monit
```

### 9. Backup y Recuperación

#### Script de Backup
Crear script `/var/www/backup-ugc.sh`:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/ugc-studio"
DB_BACKUP="$BACKUP_DIR/db_backup_$DATE.sql"
FILES_BACKUP="$BACKUP_DIR/files_backup_$DATE.tar.gz"

mkdir -p $BACKUP_DIR

# Backup de base de datos
pg_dump "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" > $DB_BACKUP

# Backup de archivos
tar -czf $FILES_BACKUP /var/www/ugc-studio

# Limpiar backups antiguos (más de 30 días)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completado: $DATE"
```

#### Configurar Cron para Backup
```bash
# Editar crontab
crontab -e

# Agregar línea para backup diario a las 2 AM
0 2 * * * /var/www/backup-ugc.sh
```

### 10. Actualizaciones

#### Script de Actualización
Crear script `/var/www/update-ugc.sh`:

```bash
#!/bin/bash
cd /var/www/ugc-studio

# Backup antes de actualizar
/var/www/backup-ugc.sh

# Pull de cambios
git pull origin main

# Instalar dependencias
npm install --production

# Reiniciar aplicación
pm2 restart ugc-studio

echo "Actualización completada"
```

### 11. Verificación del Despliegue

#### Health Check
```bash
# Verificar que la aplicación responde
curl -f http://localhost:3000/health

# Verificar que Nginx funciona
curl -f https://tu-dominio.com

# Verificar logs
pm2 logs ugc-studio --lines 50
```

#### Tests de Funcionalidad
1. Acceder a la aplicación web
2. Probar login/logout
3. Crear una marca
4. Crear un producto
5. Generar contenido UGC
6. Verificar subida de archivos

### 12. Troubleshooting

#### Problemas Comunes

**Error 502 Bad Gateway**
```bash
# Verificar que PM2 está corriendo
pm2 status

# Verificar logs de Nginx
sudo tail -f /var/log/nginx/error.log

# Verificar logs de la aplicación
pm2 logs ugc-studio
```

**Error de Conexión a Base de Datos**
```bash
# Verificar variables de entorno
pm2 env 0

# Verificar conectividad
telnet db.[project-ref].supabase.co 5432
```

**Problemas de Permisos**
```bash
# Corregir permisos
sudo chown -R www-data:www-data /var/www/ugc-studio
sudo chmod -R 755 /var/www/ugc-studio
```

### 13. Optimización de Rendimiento

#### Configuración de PM2
```javascript
// En ecosystem.config.js
{
  instances: 'max',
  exec_mode: 'cluster',
  max_memory_restart: '1G',
  node_args: '--max-old-space-size=1024'
}
```

#### Configuración de Nginx
```nginx
# En configuración de Nginx
worker_processes auto;
worker_connections 1024;

# Cache de archivos estáticos
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

**Nota**: Esta guía asume un servidor Ubuntu/CentOS. Ajusta los comandos según tu distribución de Linux.
