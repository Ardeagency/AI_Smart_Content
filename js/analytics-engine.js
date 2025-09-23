// Analytics Engine - Sistema Avanzado de Analytics y Métricas
class AnalyticsEngine {
    constructor() {
        this.isInitialized = false;
        this.realTimeMetrics = {
            activeUsers: new Set(),
            currentSessions: new Map(),
            pageViews: 0,
            interactions: 0,
            errors: 0,
            performance: []
        };
        
        this.aggregatedMetrics = {
            daily: new Map(),
            weekly: new Map(),
            monthly: new Map()
        };
        
        this.eventBuffer = [];
        this.bufferSize = 100;
        this.flushInterval = 5000; // 5 seconds
        
        this.segments = {
            device: {},
            browser: {},
            location: {},
            behavior: {},
            engagement: {}
        };

        this.goals = new Map();
        this.funnels = new Map();
        
        this.init();
    }

    async init() {
        try {
            await this.loadConfiguration();
            await this.loadHistoricalData();
            await this.setupEventTracking();
            await this.setupPerformanceMonitoring();
            await this.setupGoalsAndFunnels();
            await this.startRealTimeTracking();
            
            this.isInitialized = true;
            console.log('📊 AnalyticsEngine initialized successfully');
        } catch (error) {
            console.error('❌ AnalyticsEngine initialization failed:', error);
        }
    }

    // ========================
    // CONFIGURATION & SETUP
    // ========================

    async loadConfiguration() {
        this.config = {
            enableRealTime: true,
            enableHeatmaps: true,
            enableUserJourney: true,
            enablePerformanceMonitoring: true,
            enableErrorTracking: true,
            enableGoalTracking: true,
            sampleRate: 1.0, // 100% sampling
            bufferSize: 100,
            flushInterval: 5000,
            retentionDays: 30
        };

        // Load from settings if available
        if (window.localDB && window.localDB.isReady) {
            const savedConfig = await window.localDB.getSetting('analytics_config');
            if (savedConfig) {
                this.config = { ...this.config, ...savedConfig };
            }
        }
    }

    async loadHistoricalData() {
        if (!window.localDB || !window.localDB.isReady) return;

        try {
            // Load last 30 days of data for aggregation
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const historicalData = await window.localDB.getAnalyticsByDateRange(thirtyDaysAgo, new Date());
            
            await this.processHistoricalData(historicalData);
            console.log(`📊 Loaded ${historicalData.length} historical analytics events`);
        } catch (error) {
            console.warn('Failed to load historical data:', error);
        }
    }

    async processHistoricalData(data) {
        for (const event of data) {
            this.updateAggregatedMetrics(event);
            this.updateSegmentation(event);
        }
    }

    setupEventTracking() {
        // Integrate with DataCollector
        if (window.dataCollector) {
            // Hook into existing event tracking
            const originalTrackEvent = window.dataCollector.trackEvent.bind(window.dataCollector);
            window.dataCollector.trackEvent = (eventName, data) => {
                originalTrackEvent(eventName, data);
                this.processEvent({
                    name: eventName,
                    data: data,
                    timestamp: new Date().toISOString(),
                    sessionId: window.dataCollector.getSessionId(),
                    deviceId: window.dataCollector.getDeviceId()
                });
            };
        }

        // Track page navigation
        this.trackPageNavigation();
        
        // Track scroll depth
        this.trackScrollDepth();
        
        // Track time on page
        this.trackTimeOnPage();
        
        // Track clicks and interactions
        this.trackInteractions();
    }

    setupPerformanceMonitoring() {
        // Web Vitals tracking
        this.trackWebVitals();
        
        // Resource loading
        this.trackResourcePerformance();
        
        // Memory usage
        this.trackMemoryUsage();
        
        // FPS monitoring
        this.trackFrameRate();
    }

    async setupGoalsAndFunnels() {
        // Define default goals
        this.defineGoal('onboarding_completion', {
            name: 'Onboarding Completion',
            type: 'event',
            conditions: [
                { event: 'onboarding_completed' }
            ],
            value: 100
        });

        this.defineGoal('ugc_generation', {
            name: 'UGC Generation',
            type: 'event',
            conditions: [
                { event: 'ugc_generated' }
            ],
            value: 50
        });

        this.defineGoal('project_creation', {
            name: 'Project Creation',
            type: 'event',
            conditions: [
                { event: 'project_created' }
            ],
            value: 25
        });

        // Define conversion funnel
        this.defineFunnel('user_activation', {
            name: 'User Activation Funnel',
            steps: [
                { name: 'Landing Page Visit', event: 'page_view', page: 'index.html' },
                { name: 'Plans Page Visit', event: 'page_view', page: 'planes.html' },
                { name: 'Payment Modal Open', event: 'payment_modal_opened' },
                { name: 'Onboarding Start', event: 'onboarding_started' },
                { name: 'Onboarding Complete', event: 'onboarding_completed' }
            ]
        });
    }

    startRealTimeTracking() {
        // Update active users
        this.updateActiveUsers();
        
        // Flush buffer periodically
        setInterval(() => {
            this.flushEventBuffer();
        }, this.flushInterval);
        
        // Update aggregated metrics (disabled to prevent errors)
        // Safely handle metrics updates
        setInterval(() => {
            try {
                if (typeof this.updateAggregatedMetrics === 'function') {
                    this.updateAggregatedMetrics();
                }
            } catch (error) {
                console.warn('Analytics metrics update failed:', error.message);
            }
        }, 60000); // Every minute
        
        // Clean old data
        setInterval(() => {
            this.cleanOldData();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    // ========================
    // EVENT PROCESSING
    // ========================

    processEvent(event) {
        if (!this.shouldSampleEvent()) return;

        // Add to buffer
        this.eventBuffer.push({
            ...event,
            id: this.generateEventId(),
            processed: false
        });

        // Update real-time metrics
        this.updateRealTimeMetrics(event);
        
        // Check goals and funnels
        this.checkGoals(event);
        this.updateFunnels(event);
        
        // Update segmentation
        this.updateSegmentation(event);
        
        // Flush if buffer is full
        if (this.eventBuffer.length >= this.bufferSize) {
            this.flushEventBuffer();
        }
    }

    shouldSampleEvent() {
        return Math.random() < this.config.sampleRate;
    }

    updateRealTimeMetrics(event) {
        // Update page views
        if (event.name === 'page_view') {
            this.realTimeMetrics.pageViews++;
        }
        
        // Update interactions
        if (event.name === 'click' || event.name === 'input') {
            this.realTimeMetrics.interactions++;
        }
        
        // Update errors
        if (event.name === 'error') {
            this.realTimeMetrics.errors++;
        }
        
        // Update active users
        if (event.sessionId) {
            this.realTimeMetrics.activeUsers.add(event.sessionId);
            this.realTimeMetrics.currentSessions.set(event.sessionId, {
                lastActivity: new Date(),
                events: (this.realTimeMetrics.currentSessions.get(event.sessionId)?.events || 0) + 1
            });
        }
    }

    async flushEventBuffer() {
        if (this.eventBuffer.length === 0) return;
        
        const eventsToFlush = [...this.eventBuffer];
        this.eventBuffer = [];
        
        // Save to local database
        if (window.localDB && window.localDB.isReady) {
            for (const event of eventsToFlush) {
                try {
                    await window.localDB.saveAnalytics(event);
                    event.processed = true;
                } catch (error) {
                    console.warn('Failed to save analytics event:', error);
                    // Re-add to buffer for retry
                    this.eventBuffer.push(event);
                }
            }
        }
        
        console.log(`📊 Flushed ${eventsToFlush.filter(e => e.processed).length} analytics events`);
    }

    // ========================
    // PAGE TRACKING
    // ========================

    trackPageNavigation() {
        let currentPage = window.location.pathname;
        let pageStartTime = Date.now();
        
        // Track initial page view
        this.trackPageView(currentPage);
        
        // Listen for navigation changes
        const observer = new MutationObserver(() => {
            if (window.location.pathname !== currentPage) {
                // Track time on previous page
                this.trackEvent('time_on_page', {
                    page: currentPage,
                    duration: Date.now() - pageStartTime
                });
                
                // Track new page view
                currentPage = window.location.pathname;
                pageStartTime = Date.now();
                this.trackPageView(currentPage);
            }
        });
        
        observer.observe(document, { childList: true, subtree: true });
        
        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.trackEvent('page_visibility', {
                page: currentPage,
                hidden: document.hidden,
                duration: Date.now() - pageStartTime
            });
        });
    }

    trackPageView(page) {
        this.trackEvent('page_view', {
            page: page,
            title: document.title,
            referrer: document.referrer,
            userAgent: navigator.userAgent
        });
    }

    trackScrollDepth() {
        let maxScroll = 0;
        let scrollMilestones = [25, 50, 75, 90, 100];
        let trackedMilestones = new Set();
        
        const trackScroll = this.debounce(() => {
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollTop = window.pageYOffset;
            const scrollPercent = Math.round((scrollTop / scrollHeight) * 100);
            
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                
                // Track milestones
                for (const milestone of scrollMilestones) {
                    if (scrollPercent >= milestone && !trackedMilestones.has(milestone)) {
                        trackedMilestones.add(milestone);
                        this.trackEvent('scroll_depth', {
                            page: window.location.pathname,
                            depth: milestone,
                            maxDepth: maxScroll
                        });
                    }
                }
            }
        }, 250);
        
        window.addEventListener('scroll', trackScroll);
    }

    trackTimeOnPage() {
        let startTime = Date.now();
        let isActive = true;
        
        // Track focus/blur
        window.addEventListener('focus', () => {
            if (!isActive) {
                startTime = Date.now();
                isActive = true;
            }
        });
        
        window.addEventListener('blur', () => {
            if (isActive) {
                this.trackEvent('active_time', {
                    page: window.location.pathname,
                    duration: Date.now() - startTime
                });
                isActive = false;
            }
        });
        
        // Track before unload
        window.addEventListener('beforeunload', () => {
            if (isActive) {
                this.trackEvent('active_time', {
                    page: window.location.pathname,
                    duration: Date.now() - startTime
                });
            }
        });
    }

    trackInteractions() {
        // Click tracking with heatmap data
        document.addEventListener('click', (e) => {
            const element = e.target;
            const rect = element.getBoundingClientRect();
            
            this.trackEvent('click', {
                element: {
                    tagName: element.tagName,
                    id: element.id,
                    className: element.className,
                    textContent: element.textContent?.substring(0, 100)
                },
                position: {
                    x: e.clientX,
                    y: e.clientY,
                    elementX: e.clientX - rect.left,
                    elementY: e.clientY - rect.top
                },
                page: window.location.pathname,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            });
        });
        
        // Form interactions
        document.addEventListener('submit', (e) => {
            const form = e.target;
            const formData = new FormData(form);
            
            this.trackEvent('form_submit', {
                formId: form.id,
                formClass: form.className,
                fields: Array.from(formData.keys()),
                page: window.location.pathname
            });
        });
        
        // Input focus tracking
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                this.trackEvent('input_focus', {
                    inputType: e.target.type,
                    inputId: e.target.id,
                    inputName: e.target.name,
                    page: window.location.pathname
                });
            }
        });
    }

    // ========================
    // PERFORMANCE TRACKING
    // ========================

    trackWebVitals() {
        // First Contentful Paint
        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.name === 'first-contentful-paint') {
                        this.trackEvent('web_vital', {
                            name: 'FCP',
                            value: entry.startTime,
                            page: window.location.pathname
                        });
                    }
                }
            }).observe({ entryTypes: ['paint'] });
        } catch (e) {}
        
        // Largest Contentful Paint
        try {
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                
                this.trackEvent('web_vital', {
                    name: 'LCP',
                    value: lastEntry.startTime,
                    page: window.location.pathname
                });
            }).observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {}
        
        // Cumulative Layout Shift
        try {
            let cumulativeLayoutShift = 0;
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                        cumulativeLayoutShift += entry.value;
                    }
                }
                
                this.trackEvent('web_vital', {
                    name: 'CLS',
                    value: cumulativeLayoutShift,
                    page: window.location.pathname
                });
            }).observe({ entryTypes: ['layout-shift'] });
        } catch (e) {}
    }

    trackResourcePerformance() {
        // Track resource loading
        try {
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.trackEvent('resource_performance', {
                        name: entry.name,
                        type: entry.initiatorType,
                        duration: entry.duration,
                        size: entry.transferSize || 0,
                        page: window.location.pathname
                    });
                }
            }).observe({ entryTypes: ['resource'] });
        } catch (e) {}
    }

    trackMemoryUsage() {
        // DISABLED: Memory tracking causes excessive events
        // TODO: Implement more efficient memory monitoring if needed
        console.log('📊 Memory usage tracking disabled to prevent spam');
        return;
        
        /* ORIGINAL CODE DISABLED
        if (!performance.memory) return;
        
        // Solo una medición inicial
        this.trackEvent('memory_usage', {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            page: window.location.pathname,
            timestamp: Date.now()
        });
        */
    }

    trackFrameRate() {
        // DISABLED: Frame rate tracking causes excessive console spam
        // TODO: Implement more efficient FPS tracking if needed
        console.log('📊 Frame rate tracking disabled to prevent console spam');
        return;
        
        /* ORIGINAL CODE DISABLED
        let frameCount = 0;
        let lastTime = performance.now();
        let measurementCount = 0;
        const maxMeasurements = 5; // Solo 5 mediciones iniciales
        
        const measureFPS = () => {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime >= lastTime + 5000) { // Cada 5 segundos en lugar de 1
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                
                if (measurementCount < maxMeasurements) {
                    this.trackEvent('frame_rate', {
                        fps: fps,
                        page: window.location.pathname,
                        measurement: measurementCount + 1
                    });
                    measurementCount++;
                }
                
                frameCount = 0;
                lastTime = currentTime;
                
                if (measurementCount >= maxMeasurements) {
                    console.log('📊 FPS tracking completed');
                    return;
                }
            }
            
            if (measurementCount < maxMeasurements) {
                requestAnimationFrame(measureFPS);
            }
        };
        
        requestAnimationFrame(measureFPS);
        */
    }

    // ========================
    // GOALS & FUNNELS
    // ========================

    defineGoal(id, goal) {
        this.goals.set(id, {
            ...goal,
            id: id,
            createdAt: new Date().toISOString(),
            completions: 0,
            lastCompleted: null
        });
    }

    defineFunnel(id, funnel) {
        this.funnels.set(id, {
            ...funnel,
            id: id,
            createdAt: new Date().toISOString(),
            sessions: new Map(),
            conversions: []
        });
    }

    checkGoals(event) {
        for (const [id, goal] of this.goals) {
            if (this.isGoalMet(goal, event)) {
                goal.completions++;
                goal.lastCompleted = new Date().toISOString();
                
                this.trackEvent('goal_completed', {
                    goalId: id,
                    goalName: goal.name,
                    value: goal.value,
                    sessionId: event.sessionId
                });
            }
        }
    }

    isGoalMet(goal, event) {
        for (const condition of goal.conditions) {
            if (condition.event === event.name) {
                // Check additional conditions
                if (condition.page && event.data?.page !== condition.page) {
                    return false;
                }
                return true;
            }
        }
        return false;
    }

    updateFunnels(event) {
        for (const [id, funnel] of this.funnels) {
            this.updateFunnelProgress(funnel, event);
        }
    }

    updateFunnelProgress(funnel, event) {
        const sessionId = event.sessionId;
        if (!sessionId) return;
        
        let sessionProgress = funnel.sessions.get(sessionId) || {
            currentStep: 0,
            startTime: new Date().toISOString(),
            steps: []
        };
        
        // Check if event matches next step
        const nextStep = funnel.steps[sessionProgress.currentStep];
        if (nextStep && this.isStepMet(nextStep, event)) {
            sessionProgress.steps.push({
                stepIndex: sessionProgress.currentStep,
                stepName: nextStep.name,
                timestamp: event.timestamp
            });
            
            sessionProgress.currentStep++;
            
            // Check if funnel is completed
            if (sessionProgress.currentStep >= funnel.steps.length) {
                funnel.conversions.push({
                    sessionId: sessionId,
                    completedAt: new Date().toISOString(),
                    duration: Date.now() - new Date(sessionProgress.startTime).getTime(),
                    steps: sessionProgress.steps
                });
                
                this.trackEvent('funnel_completed', {
                    funnelId: funnel.id,
                    funnelName: funnel.name,
                    sessionId: sessionId,
                    duration: Date.now() - new Date(sessionProgress.startTime).getTime()
                });
                
                // Reset session progress
                funnel.sessions.delete(sessionId);
            } else {
                funnel.sessions.set(sessionId, sessionProgress);
            }
        }
    }

    isStepMet(step, event) {
        if (step.event !== event.name) return false;
        
        if (step.page && event.data?.page !== step.page) return false;
        
        return true;
    }

    // ========================
    // SEGMENTATION
    // ========================

    updateSegmentation(event) {
        const sessionId = event.sessionId;
        if (!sessionId) return;
        
        // Device segmentation
        if (window.dataCollector) {
            const deviceData = window.dataCollector.getCollectedData().device;
            this.updateSegment('device', deviceData.type, sessionId);
            this.updateSegment('os', deviceData.os, sessionId);
        }
        
        // Browser segmentation
        if (window.dataCollector) {
            const browserData = window.dataCollector.getCollectedData().browser;
            this.updateSegment('browser', browserData.name, sessionId);
        }
        
        // Behavioral segmentation
        if (event.name === 'page_view') {
            this.updateSegment('page_views', 'active_user', sessionId);
        }
        
        if (event.name === 'ugc_generated') {
            this.updateSegment('behavior', 'ugc_creator', sessionId);
        }
        
        if (event.name === 'project_created') {
            this.updateSegment('behavior', 'project_creator', sessionId);
        }
    }

    updateSegment(category, segment, sessionId) {
        if (!this.segments[category]) {
            this.segments[category] = {};
        }
        
        if (!this.segments[category][segment]) {
            this.segments[category][segment] = new Set();
        }
        
        this.segments[category][segment].add(sessionId);
    }

    // ========================
    // REPORTING & ANALYTICS
    // ========================

    async generateReport(timeRange = '7d') {
        const endDate = new Date();
        const startDate = new Date();
        
        switch (timeRange) {
            case '1d':
                startDate.setDate(endDate.getDate() - 1);
                break;
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            default:
                startDate.setDate(endDate.getDate() - 7);
        }
        
        const events = window.localDB ? 
            await window.localDB.getAnalyticsByDateRange(startDate, endDate) : [];
        
        return {
            timeRange: timeRange,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            overview: this.generateOverviewMetrics(events),
            pages: this.generatePageMetrics(events),
            users: this.generateUserMetrics(events),
            performance: this.generatePerformanceMetrics(events),
            goals: this.generateGoalMetrics(events),
            funnels: this.generateFunnelMetrics(),
            segments: this.generateSegmentMetrics()
        };
    }

    generateOverviewMetrics(events) {
        const pageViews = events.filter(e => e.name === 'page_view').length;
        const uniqueSessions = new Set(events.map(e => e.sessionId)).size;
        const totalEvents = events.length;
        const bounceRate = this.calculateBounceRate(events);
        
        return {
            pageViews,
            uniqueSessions,
            totalEvents,
            bounceRate,
            avgSessionDuration: this.calculateAvgSessionDuration(events)
        };
    }

    generatePageMetrics(events) {
        const pageViews = events.filter(e => e.name === 'page_view');
        const pageMetrics = {};
        
        for (const event of pageViews) {
            const page = event.data.page;
            if (!pageMetrics[page]) {
                pageMetrics[page] = {
                    views: 0,
                    uniqueViews: new Set(),
                    avgTimeOnPage: 0,
                    bounceRate: 0
                };
            }
            
            pageMetrics[page].views++;
            pageMetrics[page].uniqueViews.add(event.sessionId);
        }
        
        // Convert sets to counts
        for (const page of Object.keys(pageMetrics)) {
            pageMetrics[page].uniqueViews = pageMetrics[page].uniqueViews.size;
        }
        
        return pageMetrics;
    }

    generateUserMetrics(events) {
        const sessions = new Map();
        
        for (const event of events) {
            if (!sessions.has(event.sessionId)) {
                sessions.set(event.sessionId, {
                    events: [],
                    startTime: event.timestamp,
                    endTime: event.timestamp
                });
            }
            
            const session = sessions.get(event.sessionId);
            session.events.push(event);
            
            if (new Date(event.timestamp) > new Date(session.endTime)) {
                session.endTime = event.timestamp;
            }
        }
        
        return {
            totalSessions: sessions.size,
            avgEventsPerSession: events.length / sessions.size,
            newUsers: this.calculateNewUsers(sessions),
            returningUsers: this.calculateReturningUsers(sessions)
        };
    }

    generatePerformanceMetrics(events) {
        const performanceEvents = events.filter(e => 
            e.name === 'web_vital' || 
            e.name === 'resource_performance' || 
            e.name === 'memory_usage'
        );
        
        const metrics = {
            webVitals: {},
            avgLoadTime: 0,
            errorRate: 0
        };
        
        for (const event of performanceEvents) {
            if (event.name === 'web_vital') {
                const vitalName = event.data.name;
                if (!metrics.webVitals[vitalName]) {
                    metrics.webVitals[vitalName] = [];
                }
                metrics.webVitals[vitalName].push(event.data.value);
            }
        }
        
        // Calculate averages
        for (const [vital, values] of Object.entries(metrics.webVitals)) {
            metrics.webVitals[vital] = {
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                samples: values.length
            };
        }
        
        return metrics;
    }

    generateGoalMetrics(events) {
        const goalMetrics = {};
        
        for (const [id, goal] of this.goals) {
            goalMetrics[id] = {
                name: goal.name,
                completions: goal.completions,
                lastCompleted: goal.lastCompleted,
                value: goal.value,
                conversionRate: this.calculateGoalConversionRate(goal, events)
            };
        }
        
        return goalMetrics;
    }

    generateFunnelMetrics() {
        const funnelMetrics = {};
        
        for (const [id, funnel] of this.funnels) {
            const activeSessions = funnel.sessions.size;
            const completedConversions = funnel.conversions.length;
            
            funnelMetrics[id] = {
                name: funnel.name,
                activeSessions,
                completedConversions,
                conversionRate: activeSessions > 0 ? (completedConversions / activeSessions) * 100 : 0,
                avgDuration: this.calculateAvgFunnelDuration(funnel)
            };
        }
        
        return funnelMetrics;
    }

    generateSegmentMetrics() {
        const segmentMetrics = {};
        
        for (const [category, segments] of Object.entries(this.segments)) {
            segmentMetrics[category] = {};
            
            for (const [segment, sessions] of Object.entries(segments)) {
                segmentMetrics[category][segment] = sessions.size;
            }
        }
        
        return segmentMetrics;
    }

    // ========================
    // UTILITY METHODS
    // ========================

    calculateBounceRate(events) {
        const sessions = new Map();
        
        for (const event of events) {
            if (!sessions.has(event.sessionId)) {
                sessions.set(event.sessionId, 0);
            }
            sessions.set(event.sessionId, sessions.get(event.sessionId) + 1);
        }
        
        const singlePageSessions = Array.from(sessions.values()).filter(count => count === 1).length;
        return sessions.size > 0 ? (singlePageSessions / sessions.size) * 100 : 0;
    }

    calculateAvgSessionDuration(events) {
        const sessions = new Map();
        
        for (const event of events) {
            if (!sessions.has(event.sessionId)) {
                sessions.set(event.sessionId, {
                    start: event.timestamp,
                    end: event.timestamp
                });
            }
            
            const session = sessions.get(event.sessionId);
            if (new Date(event.timestamp) > new Date(session.end)) {
                session.end = event.timestamp;
            }
        }
        
        const durations = Array.from(sessions.values()).map(session => 
            new Date(session.end) - new Date(session.start)
        );
        
        return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }

    calculateNewUsers(sessions) {
        // This would need user identification logic
        return Math.floor(sessions.size * 0.7); // Placeholder
    }

    calculateReturningUsers(sessions) {
        return Math.floor(sessions.size * 0.3); // Placeholder
    }

    calculateGoalConversionRate(goal, events) {
        const totalSessions = new Set(events.map(e => e.sessionId)).size;
        return totalSessions > 0 ? (goal.completions / totalSessions) * 100 : 0;
    }

    calculateAvgFunnelDuration(funnel) {
        if (funnel.conversions.length === 0) return 0;
        
        const durations = funnel.conversions.map(c => c.duration);
        return durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    updateActiveUsers() {
        // Clean inactive sessions (older than 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        for (const [sessionId, session] of this.realTimeMetrics.currentSessions) {
            if (session.lastActivity < thirtyMinutesAgo) {
                this.realTimeMetrics.currentSessions.delete(sessionId);
                this.realTimeMetrics.activeUsers.delete(sessionId);
            }
        }
        
        // Schedule next update
        setTimeout(() => this.updateActiveUsers(), 60000); // Every minute
    }

    cleanOldData() {
        const retentionDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
        
        // Clean old analytics data
        if (window.localDB && window.localDB.isReady) {
            // This would be implemented in the database layer
            console.log('🧹 Cleaning analytics data older than', retentionDate);
        }
    }

    trackEvent(name, data = {}) {
        this.processEvent({
            name: name,
            data: data,
            timestamp: new Date().toISOString(),
            sessionId: window.dataCollector?.getSessionId(),
            deviceId: window.dataCollector?.getDeviceId()
        });
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    generateEventId() {
        return 'analytics_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ========================
    // PUBLIC API
    // ========================

    getRealtimeMetrics() {
        return {
            activeUsers: this.realTimeMetrics.activeUsers.size,
            activeSessions: this.realTimeMetrics.currentSessions.size,
            pageViews: this.realTimeMetrics.pageViews,
            interactions: this.realTimeMetrics.interactions,
            errors: this.realTimeMetrics.errors
        };
    }

    async getReport(timeRange = '7d') {
        return await this.generateReport(timeRange);
    }

    getGoals() {
        return Array.from(this.goals.values());
    }

    getFunnels() {
        return Array.from(this.funnels.values());
    }

    getSegments() {
        const segments = {};
        for (const [category, categorySegments] of Object.entries(this.segments)) {
            segments[category] = {};
            for (const [segment, sessions] of Object.entries(categorySegments)) {
                segments[category][segment] = sessions.size;
            }
        }
        return segments;
    }

    // ========================
    // MISSING METHODS - FIX FOR ERRORS
    // ========================

    updateAggregatedMetrics(event = null) {
        try {
            if (!this.metrics) return;

            // Update basic metrics
            if (event) {
                // Update metrics based on specific event
                const eventType = event.type || 'unknown';
                if (!this.metrics.aggregated) {
                    this.metrics.aggregated = {};
                }

                if (!this.metrics.aggregated[eventType]) {
                    this.metrics.aggregated[eventType] = 0;
                }
                this.metrics.aggregated[eventType]++;
            } else {
                // General aggregated metrics update
                if (!this.metrics.aggregated) {
                    this.metrics.aggregated = {
                        totalEvents: this.metrics.events?.length || 0,
                        totalSessions: this.metrics.sessions?.length || 0,
                        totalPageViews: this.metrics.pageViews?.length || 0,
                        lastUpdated: new Date().toISOString()
                    };
                }
            }

            // Save updated metrics
            this.saveMetricsToStorage();

        } catch (error) {
            console.warn('⚠️ Error updating aggregated metrics:', error);
        }
    }

    saveMetricsToStorage() {
        try {
            if (typeof localStorage !== 'undefined' && this.metrics) {
                localStorage.setItem('analytics_metrics', JSON.stringify({
                    ...this.metrics,
                    lastSaved: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.warn('⚠️ Error saving metrics to storage:', error);
        }
    }

    loadMetricsFromStorage() {
        try {
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem('analytics_metrics');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    this.metrics = { ...this.metrics, ...parsed };
                    return true;
                }
            }
        } catch (error) {
            console.warn('⚠️ Error loading metrics from storage:', error);
        }
        return false;
    }
}

// Global instance
let analyticsEngine;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for dependencies
    if (window.dataCollector && window.localDB) {
        analyticsEngine = new AnalyticsEngine();
        window.analyticsEngine = analyticsEngine;
        console.log('📊 AnalyticsEngine instance created');
    } else {
        // Retry after dependencies load
        setTimeout(() => {
            if (window.dataCollector && window.localDB) {
                analyticsEngine = new AnalyticsEngine();
                window.analyticsEngine = analyticsEngine;
                console.log('📊 AnalyticsEngine instance created (delayed)');
            }
        }, 2000);
    }
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsEngine;
}
