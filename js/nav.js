// Header behaviour, identical to the homepage's: dropdowns, the Menu button, Escape to close.
document.querySelectorAll('.nav__item').forEach(item => {
  const menu = item.querySelector('.nav__menu');
  if (!menu) return;
  const trigger = item.querySelector('.nav__trigger');
  const open = () => { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  item.addEventListener('mouseenter', open);
  item.addEventListener('mouseleave', close);
  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
});

const menuBtn = document.querySelector('.menu-btn');
if (menuBtn) menuBtn.addEventListener('click', () => {
  const nav = document.querySelector('.mobile-nav');
  nav.hidden = !nav.hidden;
  menuBtn.setAttribute('aria-expanded', String(!nav.hidden));
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.nav__menu').forEach(m => { m.hidden = true; });
});
