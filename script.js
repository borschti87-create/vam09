// Sanftes Scrollen für alle internen Links
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        
        // Prüfen ob es ein interner Anker-Link ist
        if (targetId.startsWith('#')) {
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                // Scrollen mit Header-Offset (75px)
                window.scrollTo({
                    top: target.offsetTop - 75,
                    behavior: 'smooth'
                });
            }
        }
    });
});