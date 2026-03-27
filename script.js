// Aktiviere später das mobile Menü
const menuToggle = document.getElementById('mobile-menu');
const nav = document.getElementById('main-nav');

if(menuToggle) {
    menuToggle.addEventListener('click', () => {
        nav.classList.toggle('active');
    });
}

// Konsolenausgabe zur Kontrolle
console.log("VAM 09 Website geladen. Rock on!");