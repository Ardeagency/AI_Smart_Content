/**
 * Utilidades para Supabase - UGC Studio
 * Funciones para manejo de datos, archivos y persistencia
 */

// Usar el cliente de Supabase ya configurado
const SUPABASE_BUCKET = 'ugc'

// Helper para normalizar arrays
function normalizeToArray(value, defaultValue = []) {
    if (!value) return defaultValue
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
        // Si es un string, convertirlo a array
        return [value]
    }
    return defaultValue
}

// Obtener el cliente de Supabase del objeto global
async function getSupabaseClient() {
    console.log('🔍 Verificando cliente de Supabase...');
    console.log('window.supabaseClient:', window.supabaseClient);
    
    // Esperar a que el cliente esté listo
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        if (window.supabaseClient && window.supabaseClient.supabase) {
            console.log('✅ Cliente de Supabase encontrado');
            return window.supabaseClient.supabase;
        }
        
        console.log(`⏳ Esperando cliente de Supabase... intento ${attempts + 1}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    console.error('❌ Cliente de Supabase no disponible después de esperar');
    console.error('window.supabaseClient:', window.supabaseClient);
    console.error('window.supabaseClient.supabase:', window.supabaseClient?.supabase);
    
    throw new Error('Cliente de Supabase no disponible');
}

/**
 * Genera un UUID único para archivos
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

/**
 * Sube un archivo a Supabase Storage y lo registra en la tabla files
 * @param {File} file - Archivo a subir
 * @param {string} userId - ID del usuario
 * @param {string} projectId - ID del proyecto
 * @param {string} kind - Tipo de archivo (logo, product_image, etc.)
 * @returns {Promise<{success: boolean, fileId?: string, error?: string}>}
 */
/**
 * Función específica para subir imagen principal de producto
 * Ejemplo de uso según tu estructura
 */
export async function uploadProductImage(userId, productId, file) {
    try {
        const filePath = `users/${userId}/products/${productId}/main.jpg`;

        // 1. Subir al bucket
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.storage
            .from('ugc')
            .upload(filePath, file, {
                upsert: true,
                cacheControl: '3600',
            });

        if (error) throw error;

        // 2. Registrar en la tabla files
        const { data: fileRecord, error: fileError } = await supabase
            .from('files')
            .insert([
                {
                    user_id: userId,
                    product_id: productId,
                    path: filePath,
                    type: file.type,
                    size: file.size,
                },
            ])
            .select()
            .single();

        if (fileError) throw fileError;

        return fileRecord;
    } catch (error) {
        console.error('Error en uploadProductImage:', error);
        throw error;
    }
}

export async function uploadAndRegisterFile(file, userId, projectId, kind) {
    try {
        console.log(`📁 Subiendo archivo: ${file?.name} (${kind})`)
        
        if (!file) {
            return { success: false, error: 'No se proporcionó archivo' }
        }

        // Validar tamaño del archivo (10MB máximo)
        const maxSize = 10 * 1024 * 1024
        if (file.size > maxSize) {
            return { success: false, error: 'El archivo es demasiado grande (máximo 10MB)' }
        }

        // Validar tipo de archivo según el kind
        const allowedTypes = {
            'logo': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
            'brand_asset': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'product_image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'product_gallery': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo'],
            'avatar_ref_image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'avatar_ref_video': ['video/mp4', 'video/quicktime', 'video/x-msvideo']
        }

        if (allowedTypes[kind] && !allowedTypes[kind].includes(file.type)) {
            return { success: false, error: `Tipo de archivo no permitido para ${kind}: ${file.type}` }
        }

        // Generar path según la nueva estructura del bucket
        const fileExt = file.name.split('.').pop().toLowerCase()
        const fileName = `${generateUUID()}.${fileExt}`
        
        // Definir estructura de paths según tipo de archivo
        let filePath;
        switch (kind) {
            case 'logo':
                filePath = `users/${userId}/brands/${projectId}/logo.${fileExt}`
                break;
            case 'brand_asset':
                filePath = `users/${userId}/brands/${projectId}/assets/${fileName}`
                break;
            case 'product_image':
                filePath = `users/${userId}/products/${projectId}/main.${fileExt}`
                break;
            case 'product_gallery':
                filePath = `users/${userId}/products/${projectId}/gallery/${fileName}`
                break;
            case 'avatar_ref_image':
                filePath = `users/${userId}/avatars/${projectId}/avatar.${fileExt}`
                break;
            case 'avatar_ref_video':
                filePath = `users/${userId}/avatars/${projectId}/${fileName}`
                break;
            default:
                filePath = `users/${userId}/brands/${projectId}/assets/${fileName}`
        }

        // Subir archivo a Storage
        const supabase = await getSupabaseClient();
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .upload(filePath, file, {
                upsert: false,
                cacheControl: '3600'
            })

        if (uploadError) {
            console.error('Error subiendo archivo:', uploadError)
            return { success: false, error: `Error subiendo archivo: ${uploadError.message}` }
        }

        // Registrar archivo en la tabla files según tu estructura
        const fileRecord = {
            user_id: userId,
            product_id: kind.includes('product') ? projectId : null,
            brand_id: kind.includes('brand') || kind === 'logo' ? projectId : null,
            avatar_id: kind.includes('avatar') ? projectId : null,
            path: filePath,
            type: file.type,
            size: file.size,
            category: kind,
            description: file.name || null
        }

        const { data: fileData, error: fileError } = await supabase
            .from('files')
            .insert(fileRecord)
            .select('id')
            .single()

        if (fileError) {
            console.error('Error registrando archivo:', fileError)
            // Intentar eliminar el archivo subido si falla el registro
            const supabase = await getSupabaseClient();
            await supabase.storage.from(SUPABASE_BUCKET).remove([filePath])
            return { success: false, error: `Error registrando archivo: ${fileError.message}` }
        }

        console.log(`✅ Archivo subido exitosamente: ${file.name} -> ${filePath}`)
        return { success: true, fileId: fileData.id }

    } catch (error) {
        console.error('Error en uploadAndRegisterFile:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea un nuevo proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, projectId?: string, error?: string}>}
 */
export async function createProject(userId, formData) {
    try {
        console.log('🏗️ Creando proyecto...')
        
        // Obtener el primer país del mercado objetivo
        const primaryCountry = Array.isArray(formData.mercado_objetivo) && formData.mercado_objetivo.length 
            ? formData.mercado_objetivo[0] 
            : 'latam'

        // Asegurar que languages sea un array
        const languages = normalizeToArray(formData.idiomas_contenido)

        const projectData = {
            user_id: userId,
            name: formData.nombre_marca || 'Proyecto sin nombre',
            website: formData.sitio_web || null,
            country: primaryCountry,
            languages: languages,
            created_at: new Date().toISOString()
        }

        console.log('📊 Datos del proyecto a enviar:', {
            name: projectData.name,
            country: projectData.country,
            languages: projectData.languages,
            languagesType: typeof projectData.languages,
            isArray: Array.isArray(projectData.languages)
        })

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('projects')
            .insert(projectData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando proyecto:', error)
            return { success: false, error: `Error creando proyecto: ${error.message}` }
        }

        console.log('✅ Proyecto creado exitosamente:', data.id)
        return { success: true, projectId: data.id }

    } catch (error) {
        console.error('Error en createProject:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea las guías de marca y sube archivos relacionados
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, guidelineId?: string, error?: string}>}
 */
export async function createBrandGuidelines(projectId, userId, formData) {
    try {
        console.log('🎨 Creando guías de marca...')
        
        // Subir logo si existe
        let logoFileId = null
        if (formData.logo_file && formData.logo_file instanceof File) {
            const logoResult = await uploadAndRegisterFile(formData.logo_file, userId, projectId, 'logo')
            if (logoResult.success) {
                logoFileId = logoResult.fileId
                console.log(`✅ Logo subido correctamente con ID: ${logoFileId}`)
            } else {
                console.warn(`⚠️ Error subiendo logo: ${logoResult.error}`)
            }
        }

        // Crear registro de brand guidelines
        const guidelineData = {
            project_id: projectId,
            name: formData.nombre_marca || 'Nueva Marca',
            tone_of_voice: formData.tono_voz || null,
            keywords_yes: formData.palabras_usar ? formData.palabras_usar.split(',').map(s => s.trim()).filter(Boolean) : [],
            keywords_no: formData.palabras_evitar ? formData.palabras_evitar.split(',').map(s => s.trim()).filter(Boolean) : [],
            dos_donts: formData.reglas_creativas || null,
            logo_file_id: logoFileId,
            brand_file_ids: [],
            reference_links: [formData.sitio_web, formData.instagram_url, formData.tiktok_url].filter(Boolean),
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('brand_guidelines')
            .insert(guidelineData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando brand guidelines:', error)
            return { success: false, error: `Error creando brand guidelines: ${error.message}` }
        }

        // Subir archivos adicionales de marca si existen
        let brandFileIds = []
        if (formData.brand_files && Array.isArray(formData.brand_files) && formData.brand_files.length > 0) {
            console.log(`📁 Subiendo ${formData.brand_files.length} archivos de marca...`)
            for (const file of formData.brand_files) {
                if (file && file instanceof File) {
                    const fileResult = await uploadAndRegisterFile(file, userId, projectId, 'brand_asset')
                    if (fileResult.success) {
                        brandFileIds.push(fileResult.fileId)
                        console.log(`✅ Archivo de marca subido: ${file.name} -> ID: ${fileResult.fileId}`)
                    } else {
                        console.warn(`⚠️ Error subiendo archivo ${file.name}: ${fileResult.error}`)
                    }
                }
            }
            
            // Actualizar brand_file_ids si se subieron archivos
            if (brandFileIds.length > 0) {
                await supabase
                    .from('brand_guidelines')
                    .update({ brand_file_ids: brandFileIds })
                    .eq('id', data.id)
            }
        }

        // Almacenar logo file ID para la tabla assets
        formData.logo_file_id = logoFileId

        console.log('✅ Brand guidelines creadas exitosamente:', data.id)
        return { success: true, guidelineId: data.id }

    } catch (error) {
        console.error('Error en createBrandGuidelines:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea el producto y sube sus imágenes
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, productId?: string, error?: string}>}
 */
export async function createProduct(projectId, userId, formData) {
    try {
        console.log('📦 Creando producto...')
        
        // Preparar beneficios
        const benefits = [
            formData.beneficio_1,
            formData.beneficio_2,
            formData.beneficio_3
        ].filter(Boolean)

        // Subir imagen principal si existe
        let mainImageId = null
        if (formData.imagen_producto_1 && formData.imagen_producto_1 instanceof File) {
            console.log(`📸 Subiendo imagen principal de producto: ${formData.imagen_producto_1.name}`)
            const imageResult = await uploadAndRegisterFile(formData.imagen_producto_1, userId, projectId, 'product_image')
            if (imageResult.success) {
                mainImageId = imageResult.fileId
                console.log(`✅ Imagen principal subida correctamente -> ID: ${mainImageId}`)
            } else {
                console.warn(`⚠️ Error subiendo imagen principal: ${imageResult.error}`)
            }
        }

        // Subir galería de imágenes
        let galleryFileIds = []
        for (let i = 2; i <= 4; i++) {
            const imageField = `imagen_producto_${i}`
            if (formData[imageField] && formData[imageField] instanceof File) {
                console.log(`📸 Subiendo imagen de galería ${i}: ${formData[imageField].name}`)
                const imageResult = await uploadAndRegisterFile(formData[imageField], userId, projectId, 'product_gallery')
                if (imageResult.success) {
                    galleryFileIds.push(imageResult.fileId)
                    console.log(`✅ Imagen de galería ${i} subida -> ID: ${imageResult.fileId}`)
                } else {
                    console.warn(`⚠️ Error subiendo imagen de galería ${i}: ${imageResult.error}`)
                }
            }
        }

        const productData = {
            project_id: projectId,
            name: formData.nombre_producto || 'Nuevo Producto',
            product_type: formData.tipo_producto || 'otros',
            short_desc: formData.descripcion_producto || 'Descripción no proporcionada',
            benefits: benefits,
            differentiators: formData.diferenciacion ? formData.diferenciacion.split(/[.;\n]/).map(s => s.trim()).filter(Boolean) : [],
            usage_steps: formData.modo_uso ? formData.modo_uso.split(/[.;\n]/).map(s => s.trim()).filter(Boolean) : [],
            ingredients: formData.ingredientes ? formData.ingredientes.split(',').map(s => s.trim()).filter(Boolean) : [],
            price: formData.precio_producto ? Number(formData.precio_producto) : null,
            variants: formData.variantes_producto ? formData.variantes_producto.split(',').map(s => s.trim()).filter(Boolean) : [],
            main_image_id: mainImageId,
            gallery_file_ids: galleryFileIds,
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('products')
            .insert(productData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando producto:', error)
            return { success: false, error: `Error creando producto: ${error.message}` }
        }

        // Almacenar IDs de archivos para la tabla assets
        const allProductImageIds = []
        if (mainImageId) allProductImageIds.push(mainImageId)
        allProductImageIds.push(...galleryFileIds)
        
        // Pasar los IDs a formData para uso posterior en createAssets
        formData.product_image_ids = allProductImageIds

        console.log('✅ Producto creado exitosamente:', data.id)
        return { success: true, productId: data.id }

    } catch (error) {
        console.error('Error en createProduct:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea el avatar y sube archivos de referencia
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, avatarId?: string, error?: string}>}
 */
export async function createAvatar(projectId, userId, formData) {
    try {
        console.log('👤 Creando avatar...')
        
        // Subir imagen de referencia si existe
        let referenceImageId = null

        if (formData.avatar_imagen_ref && formData.avatar_imagen_ref instanceof File) {
            console.log(`👤 Subiendo imagen de referencia de avatar: ${formData.avatar_imagen_ref.name}`)
            const imageResult = await uploadAndRegisterFile(formData.avatar_imagen_ref, userId, projectId, 'avatar_ref_image')
            if (imageResult.success) {
                referenceImageId = imageResult.fileId
                console.log(`✅ Imagen de avatar subida -> ID: ${referenceImageId}`)
            } else {
                console.warn(`⚠️ Error subiendo imagen de avatar: ${imageResult.error}`)
            }
        }

        // Preparar datos del avatar
        const voice = {
            ...(formData.caracteristicas_voz || {}),
            acento: formData.acento_voz || null
        }

        // Asegurar que languages y values sean arrays
        const avatarLanguages = normalizeToArray(formData.idiomas_avatar)
        const avatarValues = normalizeToArray(formData.valores_avatar)

        const avatarData = {
            project_id: projectId,
            avatar_type: formData.tipo_creador || null,
            traits: {
                rango_edad: formData.rango_edad || null,
                apariencia_fisica: formData.apariencia_fisica || null
            },
            energy: formData.energia_avatar || null,
            gender: formData.genero_avatar || null,
            voice: voice,
            languages: avatarLanguages,
            values: avatarValues,
            avatar_image_id: referenceImageId,
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('avatars')
            .insert(avatarData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando avatar:', error)
            return { success: false, error: `Error creando avatar: ${error.message}` }
        }

        console.log('✅ Avatar creado exitosamente:', data.id)
        return { success: true, avatarId: data.id }

    } catch (error) {
        console.error('Error en createAvatar:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea la información de ofertas y objetivos
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, offerId?: string, error?: string}>}
 */
export async function createOffers(projectId, userId, formData) {
    try {
        console.log('🎯 Creando offers...')
        
        const offerData = {
            project_id: projectId,
            main_objective: formData.main_objective || 'Objetivo no especificado',
            offer_desc: formData.offer_desc || null,
            cta: formData.cta || null,
            cta_url: formData.cta_url || null,
            kpis: normalizeToArray(formData.kpis),
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('offers')
            .insert(offerData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando offers:', error)
            return { success: false, error: `Error creando offers: ${error.message}` }
        }

        console.log('✅ Offers creado exitosamente:', data.id)
        return { success: true, offerId: data.id }

    } catch (error) {
        console.error('Error en createOffers:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea la información de audiencia objetivo
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, audienceId?: string, error?: string}>}
 */
export async function createAudience(projectId, userId, formData) {
    try {
        console.log('👥 Creando audience...')
        
        const audienceData = {
            project_id: projectId,
            buyer_persona: { description: formData.buyer_persona || '' },
            interests: formData.interests ? formData.interests.split(',').map(s => s.trim()).filter(Boolean) : [],
            pains: formData.pains ? formData.pains.split(',').map(s => s.trim()).filter(Boolean) : [],
            contexts: formData.contexts ? formData.contexts.split(',').map(s => s.trim()).filter(Boolean) : [],
            language_codes: normalizeToArray(formData.idiomas_contenido),
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('audience')
            .insert(audienceData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando audience:', error)
            return { success: false, error: `Error creando audience: ${error.message}` }
        }

        console.log('✅ Audience creado exitosamente:', data.id)
        return { success: true, audienceId: data.id }

    } catch (error) {
        console.error('Error en createAudience:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea la información de estética audiovisual
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, aestheticId?: string, error?: string}>}
 */
export async function createAesthetics(projectId, userId, formData) {
    try {
        console.log('🎨 Creando aesthetics...')
        
        const aestheticData = {
            project_id: projectId,
            mood: formData.mood || null,
            lighting: formData.lighting || null,
            camera: formData.camera || null,
            pace: formData.pace || null,
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('aesthetics')
            .insert(aestheticData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando aesthetics:', error)
            return { success: false, error: `Error creando aesthetics: ${error.message}` }
        }

        console.log('✅ Aesthetics creado exitosamente:', data.id)
        return { success: true, aestheticId: data.id }

    } catch (error) {
        console.error('Error en createAesthetics:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea la información de distribución
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, distributionId?: string, error?: string}>}
 */
export async function createDistribution(projectId, userId, formData) {
    try {
        console.log('📤 Creando distribution...')
        
        const distributionData = {
            project_id: projectId,
            platforms: normalizeToArray(formData.platforms),
            formats: normalizeToArray(formData.formats),
            utm_params: {},
            ab_variables: {},
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('distribution')
            .insert(distributionData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando distribution:', error)
            return { success: false, error: `Error creando distribution: ${error.message}` }
        }

        console.log('✅ Distribution creado exitosamente:', data.id)
        return { success: true, distributionId: data.id }

    } catch (error) {
        console.error('Error en createDistribution:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea los escenarios de grabación
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, scenarioId?: string, error?: string}>}
 */
export async function createScenarios(projectId, userId, formData) {
    try {
        console.log('🎬 Creando scenarios...')
        
        const scenarioData = {
            project_id: projectId,
            main_location: formData.main_location || 'Interior',
            ambience: formData.ambience || null,
            hygiene: formData.hygiene || null,
            backdrop: formData.backdrop || null,
            scenario_file_ids: [],
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('scenarios')
            .insert(scenarioData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando scenarios:', error)
            return { success: false, error: `Error creando scenarios: ${error.message}` }
        }

        console.log('✅ Scenarios creado exitosamente:', data.id)
        return { success: true, scenarioId: data.id }

    } catch (error) {
        console.error('Error en createScenarios:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea los assets del proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, assetId?: string, error?: string}>}
 */
export async function createAssets(projectId, userId, formData) {
    try {
        console.log('📁 Creando assets...')
        
        // Recopilar IDs de archivos de productos ya subidos
        // Estos se obtienen durante la creación del producto
        const productImageIds = formData.product_image_ids || []

        const assetData = {
            project_id: projectId,
            product_image_ids: productImageIds,
            logo_file_id: formData.logo_file_id || null,
            packaging_ids: [],
            manual_ids: [],
            screenshot_ids: [],
            review_ids: [],
            extra_file_ids: [],
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('assets')
            .insert(assetData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando assets:', error)
            return { success: false, error: `Error creando assets: ${error.message}` }
        }

        console.log('✅ Assets creado exitosamente:', data.id)
        return { success: true, assetId: data.id }

    } catch (error) {
        console.error('Error en createAssets:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Crea las notas adicionales del proyecto
 * @param {string} projectId - ID del proyecto
 * @param {string} userId - ID del usuario
 * @param {Object} formData - Datos del formulario
 * @returns {Promise<{success: boolean, noteId?: string, error?: string}>}
 */
export async function createNotes(projectId, userId, formData) {
    try {
        console.log('📝 Creando notes...')
        
        const noteData = {
            project_id: projectId,
            restrictions: formData.restrictions || null,
            founder_prefs: formData.founder_prefs || formData.notas_adicionales || null,
            created_at: new Date().toISOString()
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('notes')
            .insert(noteData)
            .select('id')
            .single()

        if (error) {
            console.error('Error creando notes:', error)
            return { success: false, error: `Error creando notes: ${error.message}` }
        }

        console.log('✅ Notes creado exitosamente:', data.id)
        return { success: true, noteId: data.id }

    } catch (error) {
        console.error('Error en createNotes:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Finaliza el onboarding actualizando el perfil del usuario
 * @param {string} userId - ID del usuario
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function finalizeOnboarding(userId, projectId) {
    try {
        console.log('✅ Finalizando onboarding...')
        
        const supabase = await getSupabaseClient();
        const { error } = await supabase
            .from('user_profiles')
            .update({
                onboarding_completed: true,
                default_project_id: projectId
            })
            .eq('user_id', userId)

        if (error) {
            console.error('Error finalizando onboarding:', error)
            return { success: false, error: `Error finalizando onboarding: ${error.message}` }
        }

        console.log('✅ Onboarding finalizado exitosamente')
        return { success: true }

    } catch (error) {
        console.error('Error en finalizeOnboarding:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}

/**
 * Procesa todos los datos del onboarding y los envía a Supabase
 * @param {Object} formData - Datos completos del formulario
 * @returns {Promise<{success: boolean, projectId?: string, error?: string}>}
 */
export async function processOnboardingData(formData) {
    try {
        console.log('🚀 Procesando datos del onboarding...')
        
        // Obtener usuario actual
        const supabase = await getSupabaseClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
            return { success: false, error: 'Usuario no autenticado' }
        }

        const userId = user.id

        // 1. Crear proyecto
        const projectResult = await createProject(userId, formData)
        if (!projectResult.success) {
            return projectResult
        }

        const projectId = projectResult.projectId

        // 2. Crear brand guidelines
        const brandResult = await createBrandGuidelines(projectId, userId, formData)
        if (!brandResult.success) {
            console.warn('Error creando brand guidelines:', brandResult.error)
        }

        // 3. Crear producto
        const productResult = await createProduct(projectId, userId, formData)
        if (!productResult.success) {
            console.warn('Error creando producto:', productResult.error)
        }

        // 4. Crear avatar
        const avatarResult = await createAvatar(projectId, userId, formData)
        if (!avatarResult.success) {
            console.warn('Error creando avatar:', avatarResult.error)
        }

        // 5. Crear offers
        const offersResult = await createOffers(projectId, userId, formData)
        if (!offersResult.success) {
            console.warn('Error creando offers:', offersResult.error)
        }

        // 6. Crear audience
        const audienceResult = await createAudience(projectId, userId, formData)
        if (!audienceResult.success) {
            console.warn('Error creando audience:', audienceResult.error)
        }

        // 7. Crear aesthetics
        const aestheticsResult = await createAesthetics(projectId, userId, formData)
        if (!aestheticsResult.success) {
            console.warn('Error creando aesthetics:', aestheticsResult.error)
        }

        // 8. Crear distribution
        const distributionResult = await createDistribution(projectId, userId, formData)
        if (!distributionResult.success) {
            console.warn('Error creando distribution:', distributionResult.error)
        }

        // 9. Crear scenarios
        const scenariosResult = await createScenarios(projectId, userId, formData)
        if (!scenariosResult.success) {
            console.warn('Error creando scenarios:', scenariosResult.error)
        }

        // 10. Crear assets
        const assetsResult = await createAssets(projectId, userId, formData)
        if (!assetsResult.success) {
            console.warn('Error creando assets:', assetsResult.error)
        }

        // 11. Crear notes
        const notesResult = await createNotes(projectId, userId, formData)
        if (!notesResult.success) {
            console.warn('Error creando notes:', notesResult.error)
        }

        // 13. Finalizar onboarding
        const finalizeResult = await finalizeOnboarding(userId, projectId)
        if (!finalizeResult.success) {
            console.warn('Error finalizando onboarding:', finalizeResult.error)
        }

        console.log('✅ Procesamiento de onboarding completado exitosamente')
        return { success: true, projectId: projectId }

    } catch (error) {
        console.error('Error en processOnboardingData:', error)
        return { success: false, error: `Error inesperado: ${error.message}` }
    }
}
