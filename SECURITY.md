# Seguridad: Git y credenciales

## Token de GitHub (PAT)

Si en algún momento el remoto `origin` incluía el PAT en la URL  
(`https://x-access-token:TOKEN@github.com/...`), ese token debe considerarse **comprometido**.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. **Revocar** el token afectado
3. Crear uno **nuevo** solo si lo necesitas, con el **mínimo alcance** (por ejemplo `repo` solo para repos privados)

## Remoto limpio (recomendado)

El remoto no debe llevar credenciales embebidas:

```bash
git remote set-url origin https://github.com/Ardeagency/AI_Smart_Content.git
```

## Cómo autenticarte al hacer `git push`

- **GitHub CLI:** `gh auth login`
- **SSH:** clave en tu cuenta GitHub y remoto  
  `git@github.com:Ardeagency/AI_Smart_Content.git`
- **Credential helper** del sistema o caché tras configurar credenciales

No guardes el PAT dentro de `.git/config` ni en scripts del repositorio.

## Secretos de la aplicación

No subas `.env` con `SUPABASE_SERVICE_ROLE_KEY`, claves de OpenAI, etc.  
Revisa `.gitignore` antes de cada commit.

## Vera / ai-engine

La URL del motor (`AI_ENGINE_BASE_URL`) es configuración de **despliegue**, no debe hardcodearse con secretos. Usa variables de entorno o `runtime-config.js` solo con URLs públicas del API.
