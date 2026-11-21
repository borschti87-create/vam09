const header = document.querySelector('.home-header');
const toggle = document.querySelector('#mobile-menu');
const navigation = document.querySelector('#hauptnavigation');
const compact = window.matchMedia('(max-width: 50rem)');

function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    navigation.hidden = compact.matches && !open;
}

function updateLayout() {
    toggle.hidden = !compact.matches;
    setMenu(false);
}

toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => {
    if (compact.matches && event.target.closest('a')) {
        setMenu(false);
        toggle.focus({ preventScroll: true });
    }
});
header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compact.matches && !navigation.hidden) {
        event.preventDefault();
        setMenu(false);
        toggle.focus();
    }
});
compact.addEventListener('change', updateLayout);
updateLayout();

const photoDialog = document.querySelector('#raumfoto-dialog');
const photoBody = photoDialog.querySelector('.photo-dialog-body');
const photo = document.createElement('img');

document.querySelectorAll('.room-gallery a').forEach(link => {
    link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
            typeof photoDialog.showModal !== 'function') return;
        event.preventDefault();
        photo.alt = link.querySelector('img').alt;
        photo.src = link.href;
        photoBody.replaceChildren(photo);
        photoDialog.showModal();
    });
});
