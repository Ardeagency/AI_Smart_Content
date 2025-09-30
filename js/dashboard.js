/**
 * Dashboard Manager - UGC Studio
 * Maneja los datos del panel principal y la carga de información del usuario
 */

class DashboardManager {
    constructor() {
        this.userData = null;
        this.userProfile = null;
        this.userSubscription = null;
        this.userStats = {
            totalUGCs: 0,
            totalBrands: 0,
            totalProjects: 0,
            totalFiles: 0,
            creditsUsed: 0,
            creditsRemaining: 0
        };
        this.init();
    }

    async init() {
        await this.loadUserData();
        await this.loadUserStats();
        this.createParticles();
        this.setupEventListeners();
    }

    async loadUserData() {
        try {
            // Wait for Supabase to be ready
            await this.waitForSupabase();
            
            const { data: { session } } = await window.supabaseClient.supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            this.userData = session.user;

            // Load user profile
            const { data: profile } = await window.supabaseClient.supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', session.user.id)
                .single();

            this.userProfile = profile;

            // Load subscription info
            const { data: subscription } = await window.supabaseClient.supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('status', 'active')
                .single();

            this.userSubscription = subscription;

            // Update UI with user data
            this.updateUserInterface();

        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async loadUserStats() {
        try {
            if (!this.userData) return;

            // Load projects count
            const { count: projectsCount } = await window.supabaseClient.supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.userData.id);

            // Load files count
            const { count: filesCount } = await window.supabaseClient.supabase
                .from('files')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.userData.id);

            // Load avatars count
            const { data: avatars, count: avatarsCount } = await window.supabaseClient.supabase
                .from('avatars')
                .select('*', { count: 'exact' });

            // Load recent activity
            await this.loadRecentActivity();

            // Update stats
            this.userStats = {
                totalUGCs: 0, // This would be calculated from generated content
                totalBrands: projectsCount || 0,
                totalProjects: projectsCount || 0,
                totalFiles: filesCount || 0,
                creditsUsed: 0, // This would come from usage tracking
                creditsRemaining: 'unlimited' // For free tier
            };

            this.updateStatsInterface();

        } catch (error) {
            console.error('Error loading user stats:', error);
        }
    }

    async loadRecentActivity() {
        try {
            const activities = [];
            
            // Get recent projects
            const { data: recentProjects } = await window.supabaseClient.supabase
                .from('projects')
                .select('name, created_at')
                .eq('user_id', this.userData.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (recentProjects) {
                recentProjects.forEach(project => {
                    activities.push({
                        type: 'project_created',
                        title: `Proyecto "${project.name}" creado`,
                        description: 'Nueva marca configurada exitosamente',
                        icon: 'fas fa-plus-circle',
                        timestamp: project.created_at
                    });
                });
            }

            // Get recent file uploads
            const { data: recentFiles } = await window.supabaseClient.supabase
                .from('files')
                .select('path, created_at, file_type')
                .eq('user_id', this.userData.id)
                .order('created_at', { ascending: false })
                .limit(3);

            if (recentFiles) {
                recentFiles.forEach(file => {
                    activities.push({
                        type: 'file_uploaded',
                        title: 'Archivo subido',
                        description: `Nuevo ${file.file_type || 'archivo'} añadido a la biblioteca`,
                        icon: 'fas fa-upload',
                        timestamp: file.created_at
                    });
                });
            }

            // Add welcome activity if no other activities
            if (activities.length === 0) {
                activities.push({
                    type: 'welcome',
                    title: '¡Bienvenido a UGC Studio!',
                    description: 'Tu cuenta ha sido creada exitosamente',
                    icon: 'fas fa-user-plus',
                    timestamp: this.userData.created_at
                });
            }

            // Sort by timestamp
            activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            this.updateActivityTimeline(activities.slice(0, 5));

        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    updateUserInterface() {
        if (!this.userData || !this.userProfile) return;

        // Update user name and avatar
        const userFullName = document.getElementById('userFullName');
        const userEmail = document.getElementById('userEmail');
        const userCountry = document.getElementById('userCountry');
        const userAvatarLarge = document.getElementById('userAvatarLarge');

        const displayName = this.userProfile.full_name || this.userData.user_metadata?.full_name || this.userData.email;

        if (userFullName) userFullName.textContent = displayName;
        if (userEmail) userEmail.textContent = this.userData.email;
        if (userCountry) userCountry.textContent = this.userProfile.country || 'No especificado';

        if (userAvatarLarge) {
            const initials = this.getInitials(displayName);
            userAvatarLarge.textContent = initials;
        }

        // Update plan information
        this.updatePlanInfo();

        // Update member since
        const memberSince = document.getElementById('memberSince');
        if (memberSince && this.userData.created_at) {
            const daysSince = Math.floor((new Date() - new Date(this.userData.created_at)) / (1000 * 60 * 60 * 24));
            memberSince.textContent = daysSince;
        }
    }

    updatePlanInfo() {
        const planName = document.getElementById('planName');
        const planPrice = document.getElementById('planPrice');
        const planPeriod = document.getElementById('planPeriod');
        const planBadgeText = document.getElementById('planBadgeText');
        const lastPayment = document.getElementById('lastPayment');
        const nextPayment = document.getElementById('nextPayment');

        const currentPlan = this.userProfile?.plan_type || 'free';
        const planInfo = this.getPlanInfo(currentPlan);

        if (planName) planName.textContent = planInfo.name;
        if (planPrice) planPrice.textContent = planInfo.price;
        if (planPeriod) planPeriod.textContent = planInfo.period;
        if (planBadgeText) planBadgeText.textContent = planInfo.name;

        // Payment info
        if (lastPayment) lastPayment.textContent = 'N/A';
        if (nextPayment) nextPayment.textContent = 'N/A';

        if (this.userSubscription) {
            if (lastPayment && this.userSubscription.current_period_start) {
                lastPayment.textContent = new Date(this.userSubscription.current_period_start).toLocaleDateString();
            }
            if (nextPayment && this.userSubscription.current_period_end) {
                nextPayment.textContent = new Date(this.userSubscription.current_period_end).toLocaleDateString();
            }
        }
    }

    updateStatsInterface() {
        // Update metric cards
        const totalUGCs = document.getElementById('totalUGCs');
        const creditsRemaining = document.getElementById('creditsRemaining');
        const totalBrands = document.getElementById('totalBrands');
        const conversionRate = document.getElementById('conversionRate');

        if (totalUGCs) totalUGCs.textContent = this.userStats.totalUGCs;
        if (creditsRemaining) {
            creditsRemaining.textContent = this.userStats.creditsRemaining === 'unlimited' ? '∞' : this.userStats.creditsRemaining;
        }
        if (totalBrands) totalBrands.textContent = this.userStats.totalBrands;
        if (conversionRate) conversionRate.textContent = '0%'; // Placeholder

        // Update user stats
        const totalProjects = document.getElementById('totalProjects');
        const totalFiles = document.getElementById('totalFiles');
        const creditsUsed = document.getElementById('creditsUsed');

        if (totalProjects) totalProjects.textContent = this.userStats.totalProjects;
        if (totalFiles) totalFiles.textContent = this.userStats.totalFiles;
        if (creditsUsed) {
            creditsUsed.textContent = this.userStats.creditsRemaining === 'unlimited' 
                ? `${this.userStats.creditsUsed} / ∞` 
                : `${this.userStats.creditsUsed} / ${this.userStats.creditsRemaining}`;
        }
    }

    updateActivityTimeline(activities) {
        const activityTimeline = document.getElementById('activityTimeline');
        if (!activityTimeline) return;

        // Clear existing activities except welcome message
        activityTimeline.innerHTML = '';

        activities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';

            const timeAgo = this.getTimeAgo(activity.timestamp);

            activityItem.innerHTML = `
                <div class="activity-icon">
                    <i class="${activity.icon}"></i>
                </div>
                <div class="activity-content">
                    <h4 class="activity-title">${activity.title}</h4>
                    <p class="activity-description">${activity.description}</p>
                    <div class="activity-time">
                        <i class="fas fa-calendar"></i>
                        <span>${timeAgo}</span>
                    </div>
                </div>
            `;

            activityTimeline.appendChild(activityItem);
        });
    }

    setupEventListeners() {
        // Export data button
        const exportBtn = document.querySelector('[data-action="export"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportUserData());
        }

        // Refresh dashboard button (if exists)
        const refreshBtn = document.querySelector('[data-action="refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshDashboard());
        }
    }

    async refreshDashboard() {
        try {
            await this.loadUserData();
            await this.loadUserStats();
            
            // Show refresh notification
            if (window.navigationManager) {
                window.navigationManager.showNotification(
                    'Dashboard actualizado',
                    'Los datos han sido actualizados exitosamente',
                    'success'
                );
            }
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
            if (window.navigationManager) {
                window.navigationManager.showNotification(
                    'Error',
                    'No se pudo actualizar el dashboard',
                    'error'
                );
            }
        }
    }

    async exportUserData() {
        try {
            const exportData = {
                user: {
                    email: this.userData.email,
                    created_at: this.userData.created_at
                },
                profile: this.userProfile,
                stats: this.userStats,
                exported_at: new Date().toISOString()
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ugc-studio-data-${new Date().toISOString().split('T')[0]}.json`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (window.navigationManager) {
                window.navigationManager.showNotification(
                    'Datos exportados',
                    'Tu información ha sido descargada exitosamente',
                    'success'
                );
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            if (window.navigationManager) {
                window.navigationManager.showNotification(
                    'Error',
                    'No se pudo exportar los datos',
                    'error'
                );
            }
        }
    }

    // Utility functions
    async waitForSupabase() {
        let attempts = 0;
        while ((!window.supabaseClient || !window.supabaseClient.isReady()) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!window.supabaseClient || !window.supabaseClient.isReady()) {
            throw new Error('Supabase not available');
        }
    }

    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    getPlanInfo(planType) {
        const plans = {
            'free': {
                name: 'Plan Gratuito',
                price: 'Gratis',
                period: 'para siempre'
            },
            'starter': {
                name: 'Plan Starter',
                price: 'Gratis',
                period: 'por tiempo limitado'
            },
            'pro': {
                name: 'Plan Pro',
                price: 'Gratis',
                period: 'por tiempo limitado'
            },
            'enterprise': {
                name: 'Plan Enterprise',
                price: 'Gratis',
                period: 'por tiempo limitado'
            }
        };
        return plans[planType] || plans['free'];
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) return 'Hace unos momentos';
        if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} minutos`;
        if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} horas`;
        if (diffInSeconds < 2592000) return `Hace ${Math.floor(diffInSeconds / 86400)} días`;
        if (diffInSeconds < 31536000) return `Hace ${Math.floor(diffInSeconds / 2592000)} meses`;
        return `Hace ${Math.floor(diffInSeconds / 31536000)} años`;
    }

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;

        const particleCount = 30;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // Random position and animation
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (15 + Math.random() * 10) + 's';
            
            // Random size
            const size = 1 + Math.random() * 2;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';

            particlesContainer.appendChild(particle);
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardManager;
}
