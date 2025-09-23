// UGC Generator Module
class UGCGenerator {
    constructor() {
        this.selectedStyle = null;
        this.generationConfig = {
            project: '',
            product: '',
            avatar: '',
            prompt: '',
            quantity: 6,
            format: 'video',
            includeSubtitles: true,
            includeCTA: true,
            includeBranding: false
        };
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadUserData();
    }

    bindEvents() {
        // Generate UGC button from main dashboard
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-generate')) {
                this.openGenerationModal();
            }
        });

        // UGC Generation Modal Events
        document.addEventListener('click', (e) => {
            // Close modal
            if (e.target.closest('#closeUGCModal') || 
                (e.target.closest('#ugcGenerationModal') && e.target.id === 'ugcGenerationModal')) {
                this.closeGenerationModal();
            }

            // Start generation
            if (e.target.closest('#startGeneration')) {
                this.startGeneration();
            }

            // Cancel generation
            if (e.target.closest('#cancelGeneration')) {
                this.closeGenerationModal();
            }

            // Quantity selector
            if (e.target.closest('.qty-btn')) {
                this.selectQuantity(e.target.closest('.qty-btn'));
            }
        });

        // Form changes
        document.addEventListener('change', (e) => {
            if (e.target.closest('#ugcGenerationModal')) {
                this.updateGenerationConfig();
            }
        });

        // Listen for style selection from main dashboard
        document.addEventListener('styleSelected', (e) => {
            this.selectedStyle = e.detail;
            this.updateSelectedStyleDisplay();
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeGenerationModal();
                this.closeProgressModal();
            }
        });
    }

    loadUserData() {
        // Load projects, products, and avatars from app state
        if (window.AppState) {
            const state = window.AppState.getState();
            this.populateSelectors(state);
        }
    }

    populateSelectors(state) {
        // Populate project selector
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">Seleccionar proyecto...</option>';
            state.projects?.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectSelect.appendChild(option);
            });
        }

        // Populate product selector (using projects data or separate products)
        const productSelect = document.getElementById('productSelect');
        if (productSelect) {
            productSelect.innerHTML = '<option value="">Seleccionar producto...</option>';
            
            // Add products from onboarding or projects
            if (state.onboardingData?.nombre_marca) {
                const option = document.createElement('option');
                option.value = 'main_product';
                option.textContent = state.onboardingData.nombre_marca;
                productSelect.appendChild(option);
            }
        }

        // Populate avatar selector
        const avatarSelect = document.getElementById('avatarSelect');
        if (avatarSelect) {
            avatarSelect.innerHTML = '<option value="">Seleccionar avatar...</option>';
            
            // Add avatar from onboarding
            if (state.onboardingData?.tipo_creador) {
                const option = document.createElement('option');
                option.value = 'main_avatar';
                option.textContent = `Avatar ${state.onboardingData.tipo_creador}`;
                avatarSelect.appendChild(option);
            }
        }
    }

    openGenerationModal() {
        // Load latest data
        this.loadUserData();
        
        // Show modal
        const modal = document.getElementById('ugcGenerationModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // Update style display if one is selected
        this.updateSelectedStyleDisplay();
        this.updateGenerationConfig();
    }

    closeGenerationModal() {
        const modal = document.getElementById('ugcGenerationModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    updateSelectedStyleDisplay() {
        const display = document.getElementById('selectedStyleDisplay');
        if (display) {
            if (this.selectedStyle) {
                display.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 40px; height: 40px; background: var(--primary-color); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white;">
                            <i class="fas fa-palette"></i>
                        </div>
                        <div>
                            <div style="color: var(--text-primary); font-weight: 600;">${this.selectedStyle.name}</div>
                            <div style="color: var(--text-secondary); font-size: 0.8rem;">${this.selectedStyle.description}</div>
                        </div>
                    </div>
                `;
            } else {
                display.innerHTML = '<span>Selecciona un estilo del catálogo</span>';
            }
        }
    }

    selectQuantity(btn) {
        // Remove active class from all buttons
        document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
        
        // Add active class to clicked button
        btn.classList.add('active');
        
        // Update config
        this.generationConfig.quantity = parseInt(btn.dataset.qty);
        this.updateGenerationConfig();
    }

    updateGenerationConfig() {
        // Get form values
        const projectSelect = document.getElementById('projectSelect');
        const productSelect = document.getElementById('productSelect');
        const avatarSelect = document.getElementById('avatarSelect');
        const customPrompt = document.getElementById('customPrompt');
        const formatRadios = document.querySelectorAll('input[name="format"]');
        const includeSubtitles = document.getElementById('includeSubtitles');
        const includeCTA = document.getElementById('includeCTA');
        const includeBranding = document.getElementById('includeBranding');

        // Update config object
        if (projectSelect) this.generationConfig.project = projectSelect.value;
        if (productSelect) this.generationConfig.product = productSelect.value;
        if (avatarSelect) this.generationConfig.avatar = avatarSelect.value;
        if (customPrompt) this.generationConfig.prompt = customPrompt.value;
        if (includeSubtitles) this.generationConfig.includeSubtitles = includeSubtitles.checked;
        if (includeCTA) this.generationConfig.includeCTA = includeCTA.checked;
        if (includeBranding) this.generationConfig.includeBranding = includeBranding.checked;

        // Get selected format
        formatRadios.forEach(radio => {
            if (radio.checked) {
                this.generationConfig.format = radio.value;
            }
        });

        // Update summary
        this.updateSummary();
    }

    updateSummary() {
        const summaryStyle = document.getElementById('summaryStyle');
        const summaryQuantity = document.getElementById('summaryQuantity');
        const summaryFormat = document.getElementById('summaryFormat');

        if (summaryStyle) {
            summaryStyle.textContent = this.selectedStyle ? this.selectedStyle.name : '-';
        }

        if (summaryQuantity) {
            summaryQuantity.textContent = `${this.generationConfig.quantity} variaciones`;
        }

        if (summaryFormat) {
            const formatMap = {
                'video': 'Video (MP4)',
                'image': 'Imagen (JPG)',
                'both': 'Video + Imagen'
            };
            summaryFormat.textContent = formatMap[this.generationConfig.format] || 'Video (MP4)';
        }
    }

    async startGeneration() {
        // Validation
        if (!this.selectedStyle) {
            this.showNotification('Por favor selecciona un estilo', 'warning');
            return;
        }

        if (!this.generationConfig.project && !this.generationConfig.product) {
            this.showNotification('Por favor selecciona un proyecto o producto', 'warning');
            return;
        }

        // Close generation modal
        this.closeGenerationModal();

        // Show progress modal
        this.showProgressModal();

        // Start generation process
        await this.processGeneration();
    }

    showProgressModal() {
        const modal = document.getElementById('generationProgressModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // Reset progress
        this.updateProgress(0, 'Preparando generación...');
        
        // Reset steps
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        document.getElementById('step1')?.classList.add('active');
    }

    closeProgressModal() {
        const modal = document.getElementById('generationProgressModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    async processGeneration() {
        const steps = [
            { id: 'step1', message: 'Analizando configuración...', duration: 1000 },
            { id: 'step2', message: 'Aplicando estilo seleccionado...', duration: 1500 },
            { id: 'step3', message: 'Generando contenido UGC...', duration: 3000 },
            { id: 'step4', message: 'Finalizando y optimizando...', duration: 1000 }
        ];

        let totalProgress = 0;
        const progressIncrement = 100 / steps.length;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Update current step
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
            document.getElementById(step.id)?.classList.add('active');
            
            // Update message
            this.updateProgress(totalProgress, step.message);
            
            // Simulate processing time
            await this.delay(step.duration);
            
            // Mark step as completed
            document.getElementById(step.id)?.classList.add('completed');
            document.getElementById(step.id)?.classList.remove('active');
            
            // Update progress
            totalProgress += progressIncrement;
            this.updateProgress(totalProgress, step.message);
        }

        // Complete generation
        await this.completeGeneration();
    }

    updateProgress(percent, message) {
        const progressCircle = document.getElementById('progressCircle');
        const progressPercent = document.getElementById('progressPercent');
        const progressMessage = document.getElementById('progressMessage');

        if (progressCircle) {
            const circumference = 283; // 2 * PI * 45
            const offset = circumference - (percent / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
        }

        if (progressPercent) {
            progressPercent.textContent = `${Math.round(percent)}%`;
        }

        if (progressMessage) {
            progressMessage.textContent = message;
        }
    }

    async completeGeneration() {
        // Final progress update
        this.updateProgress(100, '¡Generación completada!');
        
        // Mark all steps as completed
        document.querySelectorAll('.step').forEach(step => {
            step.classList.add('completed');
            step.classList.remove('active');
        });

        // Wait a moment to show completion
        await this.delay(1500);

        // Save generation to app state
        this.saveGenerationResult();

        // Close progress modal
        this.closeProgressModal();

        // Show success notification
        this.showNotification('¡UGC generado exitosamente!', 'success');

        // Optionally redirect to results or update dashboard
        this.showGenerationResults();
    }

    saveGenerationResult() {
        if (window.AppState) {
            const generationData = {
                style: this.selectedStyle,
                config: this.generationConfig,
                timestamp: new Date().toISOString(),
                status: 'completed',
                results: this.generateMockResults()
            };

            window.AppState.addUGCGeneration(generationData);
        }
    }

    generateMockResults() {
        // Generate mock results based on configuration
        const results = [];
        
        for (let i = 0; i < this.generationConfig.quantity; i++) {
            results.push({
                id: `ugc_${Date.now()}_${i}`,
                type: this.generationConfig.format,
                url: `https://via.placeholder.com/400x300.jpg?text=UGC+${i + 1}`,
                thumbnail: `https://via.placeholder.com/200x150.jpg?text=UGC+${i + 1}`,
                title: `UGC Variación ${i + 1}`,
                style: this.selectedStyle?.name || 'Sin estilo',
                duration: this.generationConfig.format === 'video' ? '15s' : null,
                createdAt: new Date().toISOString()
            });
        }

        return results;
    }

    showGenerationResults() {
        // This would typically show a results page or modal
        // For now, just update the dashboard to show new content
        if (window.dashboardExtended) {
            window.dashboardExtended.renderCurrentPage();
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showNotification(message, type = 'info') {
        // Create and show notification
        const notification = document.createElement('div');
        notification.className = `ugc-notification ${type}`;
        
        const iconMap = {
            'info': 'fa-info-circle',
            'success': 'fa-check-circle',
            'warning': 'fa-exclamation-triangle',
            'error': 'fa-times-circle'
        };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${iconMap[type]}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem 1.5rem;
            z-index: 3000;
            min-width: 300px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Close button functionality
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        });

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // Public method to be called from dashboard when style is selected
    setSelectedStyle(styleData) {
        this.selectedStyle = styleData;
        this.updateSelectedStyleDisplay();
        
        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('styleSelected', { 
            detail: styleData 
        }));
    }

    // Public method to open generation modal with pre-selected data
    openWithStyle(styleData) {
        this.setSelectedStyle(styleData);
        this.openGenerationModal();
    }
}

// Add notification styles
const ugcNotificationStyles = document.createElement('style');
ugcNotificationStyles.textContent = `
    .ugc-notification {
        font-family: 'Inter', sans-serif;
    }
    
    .ugc-notification.success {
        border-left: 4px solid #00D9FF;
    }
    
    .ugc-notification.warning {
        border-left: 4px solid #FFB800;
    }
    
    .ugc-notification.error {
        border-left: 4px solid #FF4444;
    }
    
    .ugc-notification.info {
        border-left: 4px solid #FD624F;
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-primary);
    }
    
    .notification-content i {
        font-size: 1.2rem;
    }
    
    .ugc-notification.success .notification-content i {
        color: #00D9FF;
    }
    
    .ugc-notification.warning .notification-content i {
        color: #FFB800;
    }
    
    .ugc-notification.error .notification-content i {
        color: #FF4444;
    }
    
    .ugc-notification.info .notification-content i {
        color: #FD624F;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.3s ease;
    }
    
    .notification-close:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.1);
    }
`;

document.head.appendChild(ugcNotificationStyles);

// Initialize UGC Generator
let ugcGenerator;

document.addEventListener('DOMContentLoaded', () => {
    ugcGenerator = new UGCGenerator();
    
    // Make globally available
    window.ugcGenerator = ugcGenerator;
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UGCGenerator;
}
