const B = 'https://ganga--link--ghhzdp9sv8hk.code.run/i/';
export const WELCOME_PIC = B + 'xy6if8fs.jpg';
// images du /start du bot, aussi utilisées comme photos de profil par défaut
export const PICS = [
  'wvz1thzx', 'o2fj6hix', 'gafdfod1', 'fplrpby1', 'h9i8jy21',
  'bgtfa3t0', 'vqein3sw', 'kfwqxcds', 'jx2md37u', 'b8kmu9y4',
  's3o26slw', '3ja15rn2', 'l1kots7k', 'jnk025hg', 'ugbla3cl',
].map(k => `${B}${k}.jpg`);
const DEF = [...PICS, WELCOME_PIC];
export const defPic = n => DEF[[...n].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7) % DEF.length];
