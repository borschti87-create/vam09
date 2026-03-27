// Konsolen-Check
console.log("VAM 09 Website geladen. Rock on!");

// Einfaches Smooth-Scrolling für die Navigation (HTML macht das meiste, aber sicher ist sicher)
document.querySelectorAll('nav a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId.startsWith('#')) {
            e.preventDefault();
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Offset wegen des Sticky-Headers
                    behavior: 'smooth'
                });
            }
        }
    });
});