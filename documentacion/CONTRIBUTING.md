# 🤝 Contribuir a UGC Studio

¡Gracias por tu interés en contribuir a UGC Studio! Este documento te guiará para hacer contribuciones efectivas al proyecto.

## 📋 Tabla de Contenidos

- [🚀 Empezando](#-empezando)
- [🛠️ Configuración del Entorno](#️-configuración-del-entorno)
- [📝 Guías de Contribución](#-guías-de-contribución)
- [🐛 Reportar Bugs](#-reportar-bugs)
- [💡 Solicitar Features](#-solicitar-features)
- [🔄 Pull Requests](#-pull-requests)
- [📖 Estilo de Código](#-estilo-de-código)
- [🧪 Testing](#-testing)

## 🚀 Empezando

1. **Fork** el repositorio
2. **Clona** tu fork localmente
3. **Configura** el upstream remote
4. **Crea** una rama para tu feature
5. **Haz** tus cambios
6. **Testea** thoroughly
7. **Commit** usando conventional commits
8. **Push** a tu fork
9. **Abre** un Pull Request

## 🛠️ Configuración del Entorno

### Prerrequisitos
- Node.js 14+
- Navegador moderno
- Git

### Instalación
```bash
# Clona tu fork
git clone https://github.com/tu-usuario/ugc-studio.git
cd ugc-studio

# Instala dependencias
npm install

# Configura upstream
git remote add upstream https://github.com/ardeagency/ugc-studio.git

# Inicia servidor de desarrollo
npm run dev
```

### Estructura del Proyecto
```
ugc-studio/
├── css/                 # Estilos CSS
├── js/                  # JavaScript modules
│   ├── backend/         # Backend serverless
│   └── frontend/        # Frontend scripts
├── docs/                # Documentación
└── tests/               # Tests
```

## 📝 Guías de Contribución

### Tipos de Contribuciones
- 🐛 **Bug fixes**
- ✨ **New features**
- 📚 **Documentation**
- 🎨 **UI/UX improvements**
- ⚡ **Performance optimizations**
- 🔒 **Security improvements**

### Antes de Contribuir
1. Busca issues existentes
2. Discute features grandes en un issue primero
3. Asegúrate de que tu idea encaje con la visión del proyecto

## 🐛 Reportar Bugs

### Antes de Reportar
- Busca issues similares existentes
- Verifica que el bug sea reproducible
- Prueba en diferentes navegadores

### Template de Bug Report
```markdown
**Descripción del Bug**
Una descripción clara y concisa del bug.

**Para Reproducir**
Pasos para reproducir el comportamiento:
1. Ve a '...'
2. Haz click en '....'
3. Scroll down to '....'
4. Ve el error

**Comportamiento Esperado**
Una descripción clara de lo que esperabas que pasara.

**Screenshots**
Si aplica, añade screenshots para ayudar a explicar tu problema.

**Información del Sistema:**
 - OS: [e.g. macOS]
 - Navegador [e.g. chrome, safari]
 - Versión [e.g. 22]

**Contexto Adicional**
Añade cualquier otro contexto sobre el problema aquí.
```

## 💡 Solicitar Features

### Antes de Solicitar
- Verifica que no exista ya la feature
- Considera si encaja con los objetivos del proyecto
- Piensa en la implementación y complejidad

### Template de Feature Request
```markdown
**¿Tu feature request está relacionada con un problema?**
Una descripción clara de cuál es el problema. Ej. Me frustra cuando [...]

**Describe la solución que te gustaría**
Una descripción clara de lo que quieres que pase.

**Describe alternativas que hayas considerado**
Una descripción clara de cualquier solución alternativa o features que hayas considerado.

**Contexto adicional**
Añade cualquier otro contexto o screenshots sobre la feature request aquí.
```

## 🔄 Pull Requests

### Proceso de PR
1. **Fork** y clona el repo
2. **Crea** una rama desde `main`
3. **Haz** tus cambios
4. **Añade** tests si es necesario
5. **Asegúrate** de que todos los tests pasen
6. **Commit** usando conventional commits
7. **Push** a tu fork
8. **Abre** un Pull Request

### Nombrado de Ramas
```
feature/nombre-de-la-feature
bugfix/descripcion-del-bug
hotfix/fix-critico
docs/actualizacion-documentacion
```

### Conventional Commits
```
feat: añade nueva funcionalidad de analytics
fix: corrige bug en el sistema de sync
docs: actualiza README con nueva información
style: formatea código según estándares
refactor: refactoriza el data collector
test: añade tests para el backend integrator
chore: actualiza dependencias
```

### Template de PR
```markdown
## Descripción
Breve descripción de los cambios

## Tipo de cambio
- [ ] Bug fix (cambio que corrige un issue)
- [ ] Nueva feature (cambio que añade funcionalidad)
- [ ] Breaking change (fix o feature que causaría que funcionalidad existente no funcione como se espera)
- [ ] Esta change requiere actualización de documentación

## ¿Cómo se ha testeado?
Describe las pruebas que ejecutaste para verificar tus cambios.

## Checklist:
- [ ] Mi código sigue las guías de estilo de este proyecto
- [ ] He realizado una auto-review de mi propio código
- [ ] He comentado mi código, particularmente en áreas difíciles de entender
- [ ] He hecho los cambios correspondientes a la documentación
- [ ] Mis cambios no generan nuevas advertencias
- [ ] He añadido tests que prueban que mi fix es efectivo o que mi feature funciona
- [ ] Tests nuevos y existentes pasan localmente con mis cambios
```

## 📖 Estilo de Código

### JavaScript
- Usa ES6+ features
- Prefer const/let over var
- Use arrow functions when appropriate
- Follow JSDoc commenting standards
- Max line length: 120 characters

### CSS
- Use CSS custom properties (variables)
- Follow BEM methodology for class naming
- Mobile-first responsive design
- Use meaningful class names

### Commits
- Use conventional commit format
- Keep commits atomic and focused
- Write clear, descriptive commit messages
- Reference issues when applicable

### Documentación
- Update README for significant changes
- Document new APIs and functions
- Include examples in documentation
- Keep documentation up to date

## 🧪 Testing

### Tipos de Tests
- **Unit tests**: Funciones individuales
- **Integration tests**: Interacción entre módulos
- **E2E tests**: Flujo completo de usuario

### Ejecutar Tests
```bash
# Todos los tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

### Escribir Tests
```javascript
// Ejemplo de unit test
describe('DataCollector', () => {
  test('should generate unique device ID', () => {
    const collector = new DataCollector();
    const id1 = collector.generateDeviceId();
    const id2 = collector.generateDeviceId();
    
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });
});
```

## 🎯 Guidelines Específicas

### Frontend
- Asegurar compatibilidad con navegadores soportados
- Mantener performance óptimo
- Seguir principios de accesibilidad (WCAG)
- Usar semantic HTML

### Backend Serverless
- Mantener funciones puras cuando sea posible
- Manejar errores apropiadamente
- Validar input de usuario
- Optimizar para performance

### Analytics
- Respetar privacidad del usuario
- Minimizar data collection
- Seguir GDPR guidelines
- Hacer analytics opt-in cuando sea posible

## 🔒 Seguridad

### Reportar Vulnerabilidades
- **NO** abras issues públicos para vulnerabilidades de seguridad
- Envía email a: security@ugcstudio.com
- Incluye detalles de la vulnerabilidad
- Permite tiempo razonable para fix antes de disclosure

### Security Checklist
- [ ] Input validation
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Secure headers
- [ ] Content Security Policy

## 📞 Soporte

¿Tienes preguntas sobre contribuciones?

- 💬 **Discord**: [UGC Studio Community](https://discord.gg/ugcstudio)
- 📧 **Email**: contribute@ugcstudio.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/ardeagency/ugc-studio/issues)

## 🙏 Reconocimiento

Todos los contribuidores serán reconocidos en:
- README.md
- Contributors page
- Release notes (para contribuciones significativas)

¡Gracias por contribuir a UGC Studio! 🚀


