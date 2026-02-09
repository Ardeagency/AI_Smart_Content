# Si `git push` devuelve error 500 (Internal Server Error)

El **500 lo devuelve GitHub** (servidor remoto), no tu ordenador. Es un error de su lado.

## Qué hacer (en orden)

### 1. Comprobar estado de GitHub
- https://www.githubstatus.com/  
Si hay incidentes, esperar a que los resuelvan y volver a intentar.

### 2. Actualizar y volver a intentar
```bash
git fetch origin
git pull --rebase origin main   # por si hubo cambios en remoto
git push origin main
```

### 3. Probar con SSH en lugar de HTTPS
Si usas HTTPS y sigue fallando, prueba con SSH (si tienes clave SSH en GitHub):

```bash
git remote set-url origin git@github.com:Ardeagency/AI_Smart_Content.git
git push origin main
```

Para volver a HTTPS:
```bash
git remote set-url origin https://github.com/Ardeagency/AI_Smart_Content.git
```

### 4. Intentar subir menos commits
A veces un push muy grande falla. Puedes probar a subir de uno en uno (solo si sabes usar rebase):

```bash
# Opción: hacer push del primer commit pendiente
git push origin 37f3414:main
# Luego los demás (depende de cómo quede el historial)
```

O simplemente **reintentar más tarde**: muchos 500 de GitHub son temporales y se resuelven solos.

---

**Resumen:** No es un fallo de permisos ni de tu terminal. Es el servidor de GitHub. Lo más habitual es esperar y reintentar, o probar con SSH.
