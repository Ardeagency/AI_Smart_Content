/**
 * Directorio de nichos comerciales (categoría → subcategorías).
 * Textos alineados con el directorio de referencia del producto (capturas 2026).
 * 24 categorías principales y ~280 subcategorías. Usado en BrandsView para
 * `nicho_mercado` y `sub_nicho` (ambos text[] en public.brands).
 *
 * @type {{ nicho: string, subs: string[] }[]}
 */
window.BRAND_NICHES_DIRECTORY = [
  {
    nicho: 'Salud y Bienestar',
    subs: [
      'Suplementos nutricionales',
      'Medicina alternativa',
      'Salud mental y terapia',
      'Fitness y ejercicio',
      'Pérdida de peso',
      'Nutrición y dietas',
      'Yoga y meditación',
      'Bienestar hormonal',
      'Salud femenina',
      'Salud masculina',
      'Sueño y descanso',
      'Rehabilitación física',
      'Odontología estética',
      'Cuidado de la visión',
      'Dermatología y piel'
    ]
  },
  {
    nicho: 'Belleza y Cuidado Personal',
    subs: [
      'Maquillaje y cosméticos',
      'Skincare y anti-edad',
      'Cuidado del cabello',
      'Fragancias y perfumes',
      'Uñas y nail art',
      'Depilación y laser',
      'Barberías y grooming',
      'Spa y estética',
      'Bronceado artificial',
      'Tatuajes y piercings',
      'Salud capilar',
      'Microblading y semipermanente'
    ]
  },
  {
    nicho: 'Moda y Vestuario',
    subs: [
      'Moda femenina',
      'Moda masculina',
      'Moda infantil',
      'Moda sostenible',
      'Ropa deportiva',
      'Lencería y ropa interior',
      'Calzado',
      'Accesorios y joyería',
      'Moda de tallas grandes',
      'Moda vintage y segunda mano',
      'Uniformes y workwear',
      'Moda de lujo'
    ]
  },
  {
    nicho: 'Tecnología y Gadgets',
    subs: [
      'Smartphones y accesorios',
      'Computadoras y laptops',
      'Wearables',
      'Smart home y domotica',
      'Drones',
      'Gaming y videojuegos',
      'Impresión 3D',
      'Realidad virtual/aumentada',
      'Accesorios para autos tech',
      'Fotografía y cámaras',
      'Audio y auriculares',
      'Software y apps'
    ]
  },
  {
    nicho: 'Finanzas y Dinero',
    subs: [
      'Inversión y bolsa',
      'Criptomonedas y Web3',
      'Finanzas personales',
      'Crédito y préstamos',
      'Seguros',
      'Bienes raíces',
      'Jubilación y pensiones',
      'Educación financiera',
      'Fintech',
      'Contabilidad y fiscalidad',
      'Crowdfunding',
      'Dinero pasivo'
    ]
  },
  {
    nicho: 'Educación y Aprendizaje',
    subs: [
      'Cursos online',
      'Idiomas',
      'Preparación de exámenes',
      'Educación infantil',
      'Habilidades digitales',
      'Coaching y mentoría',
      'E-learning B2B',
      'Formación corporativa',
      'Tutorías académicas',
      'Educación STEM',
      'Certificaciones profesionales',
      'Habilidades blandas'
    ]
  },
  {
    nicho: 'Negocios y Emprendimiento',
    subs: [
      'Startups y funding',
      'Consultoría empresarial',
      'Franquicias',
      'Negocios online',
      'Dropshipping',
      'E-commerce',
      'Marketing digital',
      'Automatización de negocios',
      'SaaS y software',
      'Propiedad intelectual',
      'Importación y exportación',
      'Modelos de suscripción'
    ]
  },
  {
    nicho: 'Marketing y Publicidad',
    subs: [
      'SEO y posicionamiento',
      'Publicidad en redes sociales',
      'Email marketing',
      'Marketing de contenidos',
      'Influencer marketing',
      'Branding',
      'Publicidad programática',
      'Video marketing',
      'Marketing de afiliados',
      'Growth hacking',
      'CRO y UX',
      'Marketing local'
    ]
  },
  {
    nicho: 'Alimentación y Gastronomía',
    subs: [
      'Comida saludable',
      'Vegana y vegetariana',
      'Snacks y confitería',
      'Bebidas artesanales',
      'Café y té',
      'Cocina étnica',
      'Suplementos deportivos',
      'Dietas especiales (keto, gluten free)',
      'Catering y eventos',
      'Delivery de comida',
      'Kits de cocina',
      'Alimentos orgánicos'
    ]
  },
  {
    nicho: 'Mascotas',
    subs: [
      'Comida para mascotas',
      'Accesorios y juguetes',
      'Veterinaria y salud',
      'Grooming y estética',
      'Entrenamiento',
      'Seguros de mascotas',
      'Mascotas exóticas',
      'Hospedaje y guardería',
      'Adopción y rescate',
      'Fotografía de mascotas'
    ]
  },
  {
    nicho: 'Viajes y Turismo',
    subs: [
      'Turismo de aventura',
      'Turismo de lujo',
      'Viajes de mochilero',
      'Turismo gastronómico',
      'Ecoturismo',
      'Turismo cultural',
      'Viajes en familia',
      'Nómadas digitales',
      'Cruceros',
      'Turismo médico',
      'Turismo de bienestar',
      'Airbnb y alojamiento'
    ]
  },
  {
    nicho: 'Hogar y Decoración',
    subs: [
      'Diseño de interiores',
      'Muebles y decoración',
      'Jardín y plantas',
      'Organización del hogar',
      'Limpieza e higiene',
      'Herramientas y bricolaje',
      'Electrodomésticos',
      'Iluminación',
      'Colchones y descanso',
      'Arte y cuadros',
      'Almacenamiento',
      'Reformas y construcción'
    ]
  },
  {
    nicho: 'Deportes y Actividad Física',
    subs: [
      'Equipamiento deportivo',
      'Nutrición deportiva',
      'Crossfit y calistenia',
      'Running y trail',
      'Ciclismo',
      'Natación',
      'Deportes de montaña',
      'Deportes acuáticos',
      'Deportes de combate',
      'Fútbol y deportes de equipo',
      'Golf',
      'Pádel y tenis'
    ]
  },
  {
    nicho: 'Entretenimiento y Medios',
    subs: [
      'Streaming y contenido',
      'Podcasting',
      'Gaming',
      'Música y producción',
      'Libros y lectura',
      'Cine y series',
      'Eventos en vivo',
      'Humor y comedia',
      'Coleccionables',
      'Juegos de mesa',
      'Juegos de rol',
      'Cómics y manga'
    ]
  },
  {
    nicho: 'Arte y Creatividad',
    subs: [
      'Diseño gráfico',
      'Fotografía',
      'Ilustración digital',
      'Pintura y dibujo',
      'Cerámica y artesanía',
      'Música y composición',
      'Escritura creativa',
      'Danza',
      'Teatro',
      'Escultura',
      'Joyería artesanal',
      'Tipografía y lettering'
    ]
  },
  {
    nicho: 'Bebés y Maternidad',
    subs: [
      'Ropa de bebé',
      'Juguetes educativos',
      'Lactancia',
      'Nutrición infantil',
      'Seguridad del hogar para bebés',
      'Sillas de auto',
      'Cochecitos',
      'Cuidado piel de bebés',
      'Embarazo y parto',
      'Fertilidad',
      'Crianza y parenting',
      'Estimulación temprana'
    ]
  },
  {
    nicho: 'Sostenibilidad y Medio Ambiente',
    subs: [
      'Energía solar',
      'Productos ecológicos',
      'Moda sostenible',
      'Alimentación orgánica',
      'Reciclaje y upcycling',
      'Movilidad eléctrica',
      'Ecoturismo',
      'Arquitectura sostenible',
      'Activismo ambiental',
      'Cero residuos'
    ]
  },
  {
    nicho: 'Automovilismo y Movilidad',
    subs: [
      'Compra y venta de autos',
      'Accesorios para vehículos',
      'Tuning y personalización',
      'Motocicletas',
      'Vehículos eléctricos',
      'Talleres y mantenimiento',
      'Seguros de auto',
      'Flotas y logística',
      'Movilidad urbana',
      'Carsharing'
    ]
  },
  {
    nicho: 'Legal y Asesoría',
    subs: [
      'Derecho laboral',
      'Derecho de familia',
      'Derecho inmobiliario',
      'Migración y visas',
      'Derecho corporativo',
      'Propiedad intelectual',
      'Protección de datos',
      'Mediación',
      'Derecho penal',
      'Asesoría para startups'
    ]
  },
  {
    nicho: 'Recursos Humanos y Trabajo',
    subs: [
      'Reclutamiento',
      'Trabajo remoto',
      'Freelancing',
      'Outplacement',
      'Formación corporativa',
      'Bienestar laboral',
      'Gestión del talento',
      'Empleo para jóvenes',
      'Headhunting',
      'Plataformas de trabajo',
      'Diversidad e inclusión',
      'Salarios y compensación'
    ]
  },
  {
    nicho: 'Inmobiliaria y construcción',
    subs: [
      'Venta de vivienda',
      'Alquiler residencial',
      'Locales comerciales',
      'Promoción nueva obra',
      'Reformas integrales',
      'Interiorismo obra nueva',
      'Tasación y valoraciones',
      'Administración de fincas',
      'PropTech e inversión',
      'Materiales de construcción',
      'Arquitectura y proyectos',
      'Certificación energética'
    ]
  },
  {
    nicho: 'Juguetes, hobbies y ocio',
    subs: [
      'Juguetes educativos',
      'Modelismo y maquetas',
      'Radio control y drones recreativos',
      'Puzzles y rompecabezas',
      'Juegos de mesa y cartas',
      'Manualidades y DIY',
      'Scrapbooking',
      'Astronomía amateur',
      'Acuarios y terrarios',
      'Coleccionismo',
      'Airsoft y simulación',
      'E-bikes y patinetes recreativos'
    ]
  },
  {
    nicho: 'Eventos y celebraciones',
    subs: [
      'Bodas y ceremonias',
      'Eventos corporativos',
      'Cumpleaños infantiles',
      'Catering y banquetes',
      'DJ, sonido e iluminación',
      'Alquiler de espacios',
      'Photocall y branding vivo',
      'Decoración floral',
      'Fotografía y vídeo de evento',
      'Animación infantil',
      'Food trucks y street food',
      'Invitaciones y papelería'
    ]
  },
  {
    nicho: 'Servicios para el hogar',
    subs: [
      'Limpieza doméstica',
      'Fontanería y electricidad',
      'Cerrajería',
      'Climatización y HVAC',
      'Control de plagas',
      'Jardinería y paisajismo',
      'Lavandería y planchado',
      'Mudanzas y guardamuebles',
      'Instalación de domótica',
      'Seguridad residencial',
      'Pintura y acabados',
      'Mantenimiento de piscinas'
    ]
  }
];
