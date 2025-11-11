// AI Smart Content - Main JavaScript File

document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
});

// Navigation functionality
function initNavigation() {
    const navbar = document.querySelector('.navbar');

    // Navbar background on scroll
    if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    }
}
