(function attachMedTutorFrameCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedTutorFrameCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMedTutorFrameCatalog() {
  // Catálogo das molduras de perfil conquistáveis. Cada moldura é SVG puro e
  // anima apenas por classes CSS (pf-*) definidas em styles.css; nenhuma
  // depende de JavaScript para se mover.
  const MAX_TRACKED_IDS = 1200;
  const MAX_TRACKED_DAYS = 400;

  const f2 = value => Number(value).toFixed(2);
  const polar = (radius, degrees) => [
    80 + radius * Math.cos((degrees - 90) * Math.PI / 180),
    80 + radius * Math.sin((degrees - 90) * Math.PI / 180)
  ];
  const ring = (radius, stroke, width = 3, extra = '') =>
    `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
  const gem = (c, angle, radius = 74, size = 6) => {
    const [x, y] = polar(radius, angle);
    return `<path class="pf-twinkle" d="M${f2(x)} ${f2(y - size)} l${size * 0.75} ${size} -${size * 0.75} ${size} -${size * 0.75} -${size}z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1"/>`;
  };

  // --- Desenhos -------------------------------------------------------------

  function ecgRingPath(radius = 66) {
    const bump = (u, start, end, height) => (u > start && u < end ? height * Math.sin(Math.PI * (u - start) / (end - start)) : 0);
    const offset = u => bump(u, -34, -22, 4) + bump(u, -8, -4, -3) + bump(u, -4, 1.5, 15) + bump(u, 1.5, 6, -7) + bump(u, 14, 30, 6);
    const points = [];
    for (let degree = -180; degree < 180; degree += (Math.abs(degree) < 40 ? 0.5 : 4)) points.push(polar(radius + offset(degree), degree));
    return 'M' + points.map(point => point.map(f2).join(' ')).join(' L') + 'Z';
  }
  const ECG_PATH = ecgRingPath();

  function asclepioMedallion(c) {
    return `<g class="pf-breathe"><circle cx="80" cy="14" r="13.5" fill="${c[2]}" stroke="${c[0]}" stroke-width="2"/>` +
      `<line x1="80" y1="4" x2="80" y2="25" stroke="${c[1]}" stroke-width="2.6" stroke-linecap="round"/><circle cx="80" cy="4" r="1.9" fill="${c[1]}"/>` +
      `<path d="M74.5 23 C86 21.5 86 18 80 16.5 C74 15 74 11.5 80 10 C85 8.8 85 6.6 82.6 5.6" fill="none" stroke="${c[0]}" stroke-width="2.1" stroke-linecap="round"/>` +
      `<ellipse cx="83.6" cy="5.2" rx="2" ry="1.4" fill="${c[0]}" transform="rotate(-25 83.6 5.2)"/></g>`;
  }
  const asclepioWings = c => [-1, 1].map(side => `<g transform="translate(${80 + side * 13} 15) scale(${side} 1)"><path d="M0 0 C6 -6 14 -8 22 -6 C16 -3 10 -1 0 3Z" fill="${c[0]}" stroke="${c[1]}" stroke-width=".8"/><path d="M2 3 C8 1 14 1 19 2 C13 4 8 6 1 6Z" fill="${c[1]}" opacity=".85"/></g>`).join('');
  const asclepioLaurel = (c, pairs) => Array.from({ length: pairs }, (_, index) => [150 + index * 12, 210 - index * 12].map(angle => {
    const [x, y] = polar(70, angle);
    return `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="7" ry="3" fill="${c[2]}" stroke="${c[0]}" stroke-width=".9" transform="rotate(${angle + 90} ${f2(x)} ${f2(y)})"/>`;
  }).join('')).join('');
  const asclepioRays = c => '<g class="pf-spin-slow">' + Array.from({ length: 24 }, (_, index) => {
    const angle = index * 15 + 7.5;
    const [x1, y1] = polar(76, angle);
    const [x2, y2] = polar(index % 2 ? 79 : 82, angle);
    return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${c[1]}" stroke-width="1.2" opacity=".75"/>`;
  }).join('') + '</g>';
  const asclepioOrbit = c => '<g class="pf-spin">' + [30, 210].map(angle => {
    const [x, y] = polar(78, angle);
    return `<path d="M${f2(x)} ${f2(y - 5)} L${f2(x + 1.3)} ${f2(y - 1.3)} L${f2(x + 5)} ${f2(y)} L${f2(x + 1.3)} ${f2(y + 1.3)} L${f2(x)} ${f2(y + 5)} L${f2(x - 1.3)} ${f2(y + 1.3)} L${f2(x - 5)} ${f2(y)} L${f2(x - 1.3)} ${f2(y - 1.3)}Z" fill="${c[1]}"/>`;
  }).join('') + '</g>';
  function asclepioSvg(c, tier) {
    return (tier >= 16 ? asclepioRays(c) : '') +
      (tier >= 3 ? ring(69, c[2], 4) : '') + ring(64, c[0], 3) +
      (tier >= 5 ? ring(73, c[1], 1, 'opacity=".8" stroke-dasharray="10 4 2 4" class="pf-spin"') : '') +
      (tier >= 9 ? asclepioLaurel(c, tier >= 13 ? 6 : 4) : '') +
      (tier >= 7 ? gem(c, 90) + gem(c, 270) : '') +
      (tier >= 12 ? gem(c, 135, 73, 4.5) + gem(c, 225, 73, 4.5) : '') +
      (tier >= 11 ? asclepioWings(c) : '') + asclepioMedallion(c) +
      (tier >= 18 ? asclepioOrbit(c) : '');
  }

  function maratonistaSvg(c, tier) {
    return ring(66, c[0], 3) + '<g class="pf-spin-slow">' + Array.from({ length: 60 }, (_, index) => {
      const big = index % 5 === 0;
      const [x1, y1] = polar(70, index * 6);
      const [x2, y2] = polar(big ? 77 : 74, index * 6);
      return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${big ? c[1] : c[0]}" stroke-width="${big ? 2.2 : 1}" opacity="${big ? 1 : 0.7}"/>`;
    }).join('') + '</g>' +
      `<g transform="translate(80 146)"><rect x="-10" y="-13" width="20" height="26" rx="2" fill="${c[2]}" stroke="${c[1]}" stroke-width="1.5"/><path d="M-6 -9 H6 L1 0 L6 9 H-6 L-1 0Z" fill="${c[0]}"/></g>` +
      (tier >= 3 ? [70, 290].map(angle => gem(c, angle, 80, 6)).join('') : '');
  }

  function curadoriaSvg(c, tier) {
    return '<g class="pf-spin-slow">' + Array.from({ length: 24 }, (_, index) => {
      const [x, y] = polar(69, index * 15);
      return `<circle cx="${f2(x)}" cy="${f2(y)}" r="7" fill="${c[2]}" stroke="${c[0]}" stroke-width="${tier >= 4 ? 1 : 0}"/>`;
    }).join('') + '</g>' + ring(64, c[0], 3) +
      `<path d="M66 140 L60 158 L70 154 L74 162 L78 144 M94 140 L100 158 L90 154 L86 162 L82 144" fill="${c[0]}" stroke="${c[1]}" stroke-width="1"/>` +
      `<g class="pf-beat"><circle cx="80" cy="12" r="9" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.5"/><path d="M75 12 l3.5 3.5 6.5 -7" fill="none" stroke="${c[2]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>` +
      (tier >= 3 ? [62, 298].map(angle => gem(c, angle, 80, 6)).join('') : '');
  }

  const RIBBON_PATH = 'M80 128 C66 112 72 98 80 106 C88 98 94 112 80 128 L68 156 M80 128 L92 156';
  function lacoSvg(c, year) {
    return ring(66, c[0], 3) + ring(72, c[1], 1, 'stroke-dasharray="1 4" class="pf-spin"') +
      `<rect x="61" y="3" width="38" height="15" rx="7.5" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.2"/>` +
      `<text x="80" y="14.2" text-anchor="middle" font-family="inherit" font-size="10.5" font-weight="800" fill="${c[2]}">${Number(year)}</text>` +
      `<g transform="translate(140 136) rotate(-18)"><g class="pf-sway"><g transform="scale(.6) translate(-80 -128)">` +
      `<path d="${RIBBON_PATH}" fill="none" stroke="${c[2]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${RIBBON_PATH}" fill="none" stroke="${c[0]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></g></g>`;
  }

  // Cada SVG com <defs> recebe ids únicos: várias molduras iguais podem estar
  // na mesma página (perfil e coleção) e ids repetidos quebrariam gradientes.
  let svgInstance = 0;
  const star4 = (x, y, size, fill, cls = '', delay = 0) => `<path class="${cls}" style="animation-delay:${delay}s" d="M${f2(x)} ${f2(y - size)} L${f2(x + size * 0.28)} ${f2(y - size * 0.28)} L${f2(x + size)} ${f2(y)} L${f2(x + size * 0.28)} ${f2(y + size * 0.28)} L${f2(x)} ${f2(y + size)} L${f2(x - size * 0.28)} ${f2(y + size * 0.28)} L${f2(x - size)} ${f2(y)} L${f2(x - size * 0.28)} ${f2(y - size * 0.28)}Z" fill="${fill}"/>`;

  function anualSvg(c, tier, year) {
    const id = `pfan${tier}x${++svgInstance}`;
    const yearText = attrs => `<text x="80" y="147.6" text-anchor="middle" font-family="inherit" font-size="20.5" font-weight="900" letter-spacing="1.4" ${attrs}>${Number(year)}</text>`;
    let s = `<defs><linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tier >= 2 ? c[0] : c[2]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>` +
      `<linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[1]}"/><stop offset="${tier >= 4 ? 0.55 : 1}" stop-color="${tier >= 4 ? c[0] : c[1]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>` +
      `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<clipPath id="${id}c"><rect x="38" y="125" width="84" height="31" rx="9"/></clipPath><clipPath id="${id}t">${yearText('')}</clipPath></defs>`;
    if (tier >= 6) s += '<g class="pf-spin-slow">' + Array.from({ length: 24 }, (_, index) => {
      const angle = index * 15 + 7.5;
      const [x1, y1] = polar(75, angle);
      const [x2, y2] = polar(index % 2 ? 78 : 81, angle);
      return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${c[1]}" stroke-width="1.2" opacity=".7"/>`;
    }).join('') + '</g>';
    if (tier >= 2) s += ring(69, c[2], 4);
    s += ring(64, c[0], tier >= 3 ? 3.2 : 2.6);
    if (tier >= 3) s += ring(73, c[1], 1, 'stroke-dasharray="2 4" opacity=".7"');
    if (tier >= 4) s += `<circle class="pf-ring-shine" cx="80" cy="80" r="64" fill="none" stroke="${c[1]}" stroke-width="3.6" pathLength="100" stroke-linecap="round"/>`;
    if (tier >= 3) s += [90, 270].map(angle => gem(c, angle, 72, 7)).join('');
    if (tier >= 4) s += [-1, 1].map(side => `<g transform="translate(${80 + side * 48} 140) scale(${side} 1)">` + [0, 1, 2].map(index => `<path class="pf-leaf" style="animation-delay:-${(index * 0.2).toFixed(1)}s" transform="rotate(${-20 - index * 28})" d="M0 0 C3 -3 9 -3 12 0 C9 3 3 3 0 0Z" fill="${c[0]}" stroke="${c[2]}" stroke-width=".7"/>`).join('') + '</g>').join('') +
      `<g class="pf-crown"><path d="M68 15 L72 5 L77 12 L80 2 L83 12 L88 5 L92 15 Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.1" stroke-linejoin="round"/><circle cx="80" cy="3" r="1.6" fill="${c[1]}"/></g>`;
    if (tier >= 5) s += [[30, 1], [62, 0.8], [118, 0.7], [300, 0.9], [330, 1], [242, 0.7]].map(([angle, scale], index) => { const [x, y] = polar(80, angle); return star4(x, y, 4.2 * scale, c[1], 'pf-twinkle', (index * 0.27).toFixed(2)); }).join('');
    if (tier >= 6) s += '<g class="pf-orbit">' + [45, 225].map(angle => { const [x, y] = polar(77, angle); return star4(x, y, 4.5, '#ffffff'); }).join('') + '</g>';
    s += `<rect x="38" y="125" width="84" height="31" rx="9" fill="url(#${id}p)" stroke="${c[1]}" stroke-width="${tier >= 4 ? 1.6 : 1.1}"/>` +
      `<rect class="pf-plaque-glint" x="41" y="128" width="78" height="25" rx="7" fill="none" stroke="${c[1]}" stroke-width=".6" opacity="${tier >= 2 ? 0.55 : 0.25}"/>` +
      `<g class="${tier >= 5 ? 'pf-digits-glow' : ''}">${yearText(`fill="url(#${id}d)" stroke="${c[2]}" stroke-width="${tier >= 3 ? 0.9 : 0.5}" paint-order="stroke"`)}</g>`;
    if (tier >= 3) s += `<g clip-path="url(#${id}c)"><rect class="pf-sweep" x="64" y="120" width="18" height="42" fill="url(#${id}s)" opacity="${tier >= 4 ? 0.85 : 0.55}"/></g>`;
    if (tier >= 5) s += `<g clip-path="url(#${id}t)"><rect class="pf-sweep pf-sweep-fast" x="66" y="126" width="12" height="32" fill="url(#${id}s)"/></g>`;
    return s;
  }

  // Louros acadêmicos: coroa que abraça o anel, com selo do período.
  // colors = [profunda, principal, clara], na mesma ordem do app.
  function laurelSvg(period, colors) {
    const [deep, main, light] = colors;
    const leavesPerSide = period <= 4 ? 5 : period <= 8 ? 6 : 7;
    const start = 200;
    const end = period <= 4 ? 300 : period <= 8 ? 316 : 330;
    const radius = 70;
    const direction = (degree, side) => {
      const theta = (degree - 90) * Math.PI / 180;
      const vector = side < 0 ? [-Math.sin(theta), Math.cos(theta)] : [Math.sin(theta), -Math.cos(theta)];
      return Math.atan2(vector[1], vector[0]) * 180 / Math.PI;
    };
    let stems = '';
    let leaves = '';
    [-1, 1].forEach(side => {
      const points = [];
      for (let angle = start; angle <= end; angle += 3) points.push(polar(radius, side < 0 ? angle : 360 - angle));
      stems += `<path d="M${points.map(point => point.map(f2).join(' ')).join(' L')}" fill="none" stroke="${deep}" stroke-width="2" stroke-linecap="round"/>`;
      for (let index = 0; index < leavesPerSide; index++) {
        const angle = start + (end - start) * (index + 0.5) / leavesPerSide;
        const degree = side < 0 ? angle : 360 - angle;
        const [x, y] = polar(radius, degree);
        [[side < 0 ? -34 : 34, 17, main], [side < 0 ? 30 : -30, 12, light]].forEach(([offset, length, fill], k) => {
          const width = length * 0.3;
          leaves += `<g transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(direction(degree, side) + offset)})"><path class="pf-leaf" style="animation-delay:-${(index * 0.14 + k * 0.07).toFixed(2)}s" d="M0 0 C${f2(length * 0.3)} ${f2(-width)} ${f2(length * 0.75)} ${f2(-width)} ${length} 0 C${f2(length * 0.75)} ${f2(width)} ${f2(length * 0.3)} ${f2(width)} 0 0Z" fill="${fill}" stroke="${deep}" stroke-width=".8"/><path d="M1.5 0 H${length - 2}" stroke="${deep}" stroke-width=".6" opacity=".7"/></g>`;
        });
      }
      const tipDegree = side < 0 ? end : 360 - end;
      const [tx, ty] = polar(radius, tipDegree);
      leaves += `<g transform="translate(${f2(tx)} ${f2(ty)}) rotate(${f2(direction(tipDegree, side))})"><path class="pf-leaf" d="M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z" fill="${main}" stroke="${deep}" stroke-width=".8"/></g>`;
      if (period >= 5) [0.3, 0.62].forEach(t => {
        const [bx, by] = polar(radius + 9, side < 0 ? start + (end - start) * t : 360 - (start + (end - start) * t));
        leaves += `<circle class="pf-beat" cx="${f2(bx)}" cy="${f2(by)}" r="2.4" fill="${light}" stroke="${deep}" stroke-width=".7"/>`;
      });
    });
    const shine = period >= 9 ? `<circle class="pf-shine" cx="80" cy="80" r="70" fill="none" stroke="${light}" stroke-width="5" pathLength="100" stroke-linecap="round" opacity=".55"/>` : '';
    const star = period >= 9 ? `<path class="pf-twinkle" d="M80 1.5 l2.6 6.2 6.6.5-5 4.3 1.6 6.4-5.8-3.5-5.8 3.5 1.6-6.4-5-4.3 6.6-.5z" fill="${light}" stroke="${main}" stroke-width=".8"/>` : '';
    return ring(63.5, main, 2.2) + stems + leaves + shine +
      `<path d="M69 140 L60 135 M91 140 L100 135" stroke="${main}" stroke-width="3" stroke-linecap="round"/>` +
      `<g class="pf-breathe"><circle cx="80" cy="146" r="12.5" fill="${deep}" stroke="${main}" stroke-width="2"/><text x="80" y="150.6" text-anchor="middle" font-family="inherit" font-size="${period >= 10 ? 10.5 : 12}" font-weight="800" fill="${light}">${period}º</text></g>` + star;
  }

  function neonSvg(colors) {
    const [main, light, deep] = colors;
    const nodes = Array.from({ length: 8 }, (_, index) => {
      const [x, y] = polar(72, index * 45 + 22.5);
      return `<circle class="pf-spark" style="animation-delay:${(index * 0.15).toFixed(2)}s" cx="${f2(x)}" cy="${f2(y)}" r="2.6" fill="${light}"/>`;
    }).join('');
    return ring(64, deep, 7, 'opacity=".55"') + ring(64, main, 2.4) + ring(72, main, 1, 'opacity=".45"') +
      `<circle class="pf-comet" cx="80" cy="80" r="64" fill="none" stroke="${light}" stroke-width="4" pathLength="100" stroke-linecap="round"/>` +
      `<circle class="pf-comet pf-comet-reverse" cx="80" cy="80" r="72" fill="none" stroke="${main}" stroke-width="2.2" pathLength="100" stroke-linecap="round"/>` + nodes +
      `<circle class="pf-halo" cx="80" cy="80" r="76" fill="none" stroke="${main}" stroke-width="1.2"/>`;
  }

  // Iluminação do Pulso Neon aplicada às demais molduras: cometa de luz no
  // anel, cometa fino no sentido contrário e halo pulsando, nas cores da
  // própria moldura. Fica por baixo de tudo, para não cobrir nenhum desenho.
  function lightingLayer(colors, radius = 64) {
    const [main, light] = colors;
    return `<g class="pf-lighting" aria-hidden="true">` +
      `<circle class="pf-comet" cx="80" cy="80" r="${radius}" fill="none" stroke="${light}" stroke-width="7" pathLength="100" stroke-linecap="round" opacity=".9"/>` +
      `<circle class="pf-comet pf-comet-reverse" cx="80" cy="80" r="${radius + 8}" fill="none" stroke="${main}" stroke-width="2.2" pathLength="100" stroke-linecap="round"/>` +
      `<circle class="pf-halo" cx="80" cy="80" r="${radius + 12}" fill="none" stroke="${main}" stroke-width="1.2"/></g>`;
  }
  // Raio do anel principal de cada desenho, para a luz correr exatamente nele.
  const LIGHT_RADIUS = { ecg: 66, chama: 65, raio: 66, desafiador: 65, sinapse: 66, maratonista: 66, laco: 66 };
  const lightRadiusFor = definition => LIGHT_RADIUS[definition.id] || LIGHT_RADIUS[definition.family] || 64;

  // Molduras antigas (Louros e Pulso Neon): regras e cores continuam no app;
  // aqui fica só o desenho novo.
  function buildLegacySvg(id, colors) {
    const period = Number(String(id).match(/^laurel-(\d{1,2})$/)?.[1] || 0);
    if (period >= 1 && period <= 12) {
      return `<svg class="profile-frame-svg pf-catalog pf-glow" viewBox="0 0 160 160" aria-hidden="true">${lightingLayer([colors[1], colors[2]], 63.5)}${laurelSvg(period, colors)}</svg>`;
    }
    if (id === 'neon') return `<svg class="profile-frame-svg pf-catalog pf-glow" viewBox="0 0 160 160" aria-hidden="true">${neonSvg(colors)}</svg>`;
    return '';
  }

  const singleSvgs = {
    ecg: c => `<path d="${ECG_PATH}" fill="none" stroke="${c[0]}" stroke-width="3" stroke-linejoin="round"/>` + ring(73, c[2], 1.5, 'stroke-dasharray="2 5"') +
      `<path class="pf-pulse" pathLength="100" d="${ECG_PATH}" fill="none" stroke="${c[1]}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    chama: c => ring(65, c[0], 3) + ring(71, c[2], 1.5) + [[80, 0, 1.15], [55, -14, 0.8], [105, 14, 0.8]].map(([x, rotation, scale], index) =>
      `<g transform="translate(${x} 146) rotate(${rotation}) scale(${scale})"><g class="pf-flicker" style="animation-delay:${(index * -0.27).toFixed(2)}s"><path d="M0 12 C-14 6 -14 -10 -4 -22 C-4 -12 2 -10 4 -16 C14 -6 14 8 0 12Z" fill="${c[0]}"/><path d="M0 9 C-6 6 -6 -2 -1 -8 C0 -3 3 -2 4 -5 C8 0 7 7 0 9Z" fill="${c[1]}"/></g></g>`).join(''),
    raio: c => ring(66, c[0], 2.5) + ring(66, c[2], 7, 'opacity=".35"') + [45, 135, 225, 315].map(angle => {
      const [x, y] = polar(71, angle);
      return `<path class="pf-flash" style="animation-delay:${(angle / 360 * 1.2).toFixed(2)}s" transform="translate(${f2(x)} ${f2(y)}) rotate(${angle}) scale(1.5)" d="M0 -10 L-5 1 H0 L-3 10 L5 -2 H0 L3 -10Z" fill="${c[0]}" stroke="${c[2]}" stroke-width=".8"/>`;
    }).join(''),
    desafiador: c => ring(65, c[0], 3) + ring(71, c[1], 1, 'stroke-dasharray="3 7" class="pf-spin" opacity=".7"') +
      `<g class="pf-beat"><g transform="translate(80 150) scale(.7) translate(-80 -140)"><line x1="56" y1="118" x2="104" y2="160" stroke="${c[1]}" stroke-width="3" stroke-linecap="round"/><line x1="104" y1="118" x2="56" y2="160" stroke="${c[1]}" stroke-width="3" stroke-linecap="round"/><path d="M66 126 H94 V137 C94 146 87 151 80 155 C73 151 66 146 66 137Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.8"/><path d="M80 130 V150 M71 138 H89" stroke="${c[2]}" stroke-width="2"/></g></g>`,
    sinapse: c => {
      const points = Array.from({ length: 12 }, (_, index) => polar(index % 2 ? 66 : 72, index * 30));
      return `<path d="M${points.map(point => point.map(f2).join(' ')).join(' L')}Z" fill="none" stroke="${c[0]}" stroke-width="1.6"/>` + ring(62, c[2], 1.5) +
        points.map(([x, y], index) => {
          const [bx, by] = polar(index % 2 ? 76 : 80, index * 30 + 8);
          return `<line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(bx)}" y2="${f2(by)}" stroke="${c[0]}" stroke-width="1.2"/><circle class="pf-spark" style="animation-delay:${(index * 0.1).toFixed(1)}s" cx="${f2(x)}" cy="${f2(y)}" r="${index % 3 === 0 ? 4.5 : 3}" fill="${c[1]}" stroke="${c[0]}" stroke-width="1"/>`;
        }).join('');
    }
  };

  // --- Definições -----------------------------------------------------------

  const FAMILIES = [
    { id: 'anual', title: 'Moldura Anual · conquiste durante o ano' },
    { id: 'asclepio', title: 'Bastão de Asclépio' },
    { id: 'conquistas', title: 'Conquistas' },
    { id: 'maratonista', title: 'Maratonista' },
    { id: 'curadoria', title: 'Selo da Curadoria' },
    { id: 'laco', title: 'Laços das campanhas de saúde' }
  ];

  const ASCLEPIO_MATERIALS = [
    ['Carvalho', '#9a6b3f', '#e3c39b', '#3b2512'], ['Cobre', '#c8743f', '#ffd2b3', '#4d2410'],
    ['Bronze', '#b8864b', '#f3d7a6', '#45300f'], ['Latão', '#d4b24c', '#fff0b8', '#4f3f0c'],
    ['Ferro polido', '#8d99a6', '#e6ecf2', '#2a3139'], ['Prata', '#c7d0d9', '#ffffff', '#3b444e'],
    ['Ouro rosé', '#e7a08c', '#ffe3da', '#5c2a20'], ['Ouro', '#ffcc33', '#fff6cc', '#6b4b00'],
    ['Jade', '#5fbf8f', '#d8f5e6', '#17402b'], ['Esmeralda', '#1fbf73', '#c9ffe3', '#064126'],
    ['Turmalina', '#2ec4b6', '#d4fbf7', '#06433e'], ['Água-marinha', '#5fd3f3', '#e3f9ff', '#0b4357'],
    ['Safira', '#3d7bf0', '#d8e5ff', '#0d2559'], ['Ametista', '#a66cf0', '#efe2ff', '#33155c'],
    ['Rubi', '#e53958', '#ffd6de', '#55091b'], ['Ônix e ouro', '#d9a521', '#fff3c4', '#000000'],
    ['Platina', '#e4e7f0', '#ffffff', '#4c5161'], ['Opala', '#9fe3e0', '#fff4fb', '#3d4f6b'],
    ['Diamante', '#bff3ff', '#ffffff', '#1d5a73'], ['Celestial', '#ffd76a', '#ffffff', '#2a1b5c']
  ];
  const MARATONISTA_TIERS = [
    ['Bronze', 100, ['#cd7f32', '#ffd8b0', '#4a2a10']], ['Prata', 500, ['#c0c8d2', '#ffffff', '#3b4450']],
    ['Ouro', 1000, ['#ffc83d', '#fff4cc', '#6b4b00']], ['Ametista', 2500, ['#b388ff', '#ede7f6', '#311b92']],
    ['Diamante', 5000, ['#7fe7ff', '#ffffff', '#0b4a63']]
  ];
  const CURADORIA_TIERS = [
    ['Cobre', 25, ['#d9774a', '#ffd9c4', '#5a2410']], ['Prata', 100, ['#b8c4cf', '#ffffff', '#38424d']],
    ['Ouro', 250, ['#f5c518', '#fff6cf', '#6a5000']], ['Turquesa', 500, ['#26c6da', '#e0f7fa', '#004d55']],
    ['Platina', 1000, ['#e5e4f0', '#ffffff', '#5b5470']]
  ];
  const LACO_MONTHS = [
    ['Janeiro Branco', 'saúde mental', ['#f2f4f3', '#ffffff', '#5f6b66']],
    ['Fevereiro Roxo', 'Alzheimer, lúpus e fibromialgia', ['#7e57c2', '#e3d7ff', '#2b1655']],
    ['Março Lilás', 'câncer do colo do útero', ['#ce93d8', '#f6e3fa', '#5b2a63']],
    ['Abril Azul', 'autismo (TEA)', ['#4fc3f7', '#e1f5fe', '#0b4660']],
    ['Maio Amarelo', 'segurança no trânsito', ['#ffb300', '#ffe9b0', '#5c3f00']],
    ['Junho Vermelho', 'doação de sangue', ['#e53935', '#ffd0cf', '#5c0d0b']],
    ['Julho Verde', 'câncer de cabeça e pescoço', ['#43a047', '#d4f2d5', '#123d14']],
    ['Agosto Dourado', 'aleitamento materno', ['#c9a227', '#f7e7b3', '#4f3d05']],
    ['Setembro Amarelo', 'prevenção do suicídio', ['#fff176', '#fffde7', '#5e5600']],
    ['Outubro Rosa', 'câncer de mama', ['#ff4f9a', '#ffd6e8', '#6d0f3a']],
    ['Novembro Azul', 'câncer de próstata', ['#1e63d6', '#cfe0ff', '#0a2457']],
    ['Dezembro Laranja', 'câncer de pele', ['#ff7043', '#ffe0d6', '#5c1a07']]
  ];
  const LACO_MIN_ANSWERS = 30;
  const ANUAL_TIERS = [
    ['Grafite', 15, ['#8a9399', '#dfe4e8', '#2b3135']], ['Bronze', 45, ['#c9803f', '#ffd6ad', '#4a2a10']],
    ['Prata', 90, ['#c9d3dc', '#ffffff', '#3a434c']], ['Ouro', 130, ['#ffc83d', '#fff4c2', '#6b4600']],
    ['Rubi', 200, ['#ff4d7d', '#ffd6e2', '#5a0a24']], ['Prisma', 500, ['#8ef3ff', '#ffffff', '#3b1c6b']]
  ];

  const STATIC_DEFINITIONS = [
    ...ASCLEPIO_MATERIALS.map(([name, ...colors], index) => ({
      id: `asclepio-${index + 1}`, family: 'asclepio', title: `Asclépio · ${name}`, colors,
      glow: index + 1 >= 14, iridescent: index + 1 === 20,
      rule: { type: 'level', min: (index + 1) * 5 }, svg: c => asclepioSvg(c, index + 1)
    })),
    { id: 'ecg', family: 'conquistas', title: 'Ritmo Cardíaco', colors: ['#00e676', '#b9ffd9', '#0a4d2c'], rule: { type: 'level', min: 10 }, svg: singleSvgs.ecg },
    { id: 'chama', family: 'conquistas', title: 'Chama da Constância', colors: ['#ff7043', '#ffe0b2', '#7a1f00'], rule: { type: 'streak', min: 7 }, svg: singleSvgs.chama },
    { id: 'raio', family: 'conquistas', title: 'Combo Relâmpago', colors: ['#ffee58', '#fffde7', '#5d4b00'], rule: { type: 'combo', min: 25 }, svg: singleSvgs.raio },
    { id: 'desafiador', family: 'conquistas', title: 'Escudo do Desafiador', colors: ['#ef5350', '#ffebee', '#5b0f0f'], rule: { type: 'challengerVotes', min: 10 }, svg: singleSvgs.desafiador },
    { id: 'sinapse', family: 'conquistas', title: 'Sinapse', colors: ['#f06292', '#fce4ec', '#5a1033'], rule: { type: 'neuroAnswered', min: 100 }, svg: singleSvgs.sinapse },
    ...MARATONISTA_TIERS.map(([name, min, colors], index) => ({
      id: `maratonista-${index + 1}`, family: 'maratonista', title: `Maratonista · ${name}`, colors, glow: index + 1 >= 4,
      rule: { type: 'answered', min }, svg: c => maratonistaSvg(c, index + 1)
    })),
    ...CURADORIA_TIERS.map(([name, min, colors], index) => ({
      id: `curadoria-${index + 1}`, family: 'curadoria', title: `Curadoria · ${name}`, colors, glow: index + 1 >= 4,
      rule: { type: 'curatedAnswered', min }, svg: c => curadoriaSvg(c, index + 1)
    }))
  ];

  function anualDefinition(year, tier) {
    const [name, min, colors] = ANUAL_TIERS[tier - 1];
    return {
      id: `anual-${year}-${tier}`, family: 'anual', title: `Anual ${year} · ${name}`, colors, year, tier,
      glow: tier >= 5, iridescent: tier === 6,
      rule: { type: 'yearAnswered', year, min }, svg: c => anualSvg(c, tier, year)
    };
  }
  function parseAnualId(id) {
    const match = /^anual-(\d{4})-([1-6])$/.exec(String(id || ''));
    if (!match) return null;
    const year = Number(match[1]);
    return year >= 2026 && year <= 2200 ? { year, tier: Number(match[2]) } : null;
  }

  function lacoDefinition(year, month) {
    const [name, theme, colors] = LACO_MONTHS[month - 1];
    return {
      id: `laco-${year}-${String(month).padStart(2, '0')}`, family: 'laco', title: `${name} ${year}`, theme, colors, year, month,
      rule: { type: 'monthAnswered', year, month, min: LACO_MIN_ANSWERS }, svg: c => lacoSvg(c, year)
    };
  }
  function parseLacoId(id) {
    const match = /^laco-(\d{4})-(\d{2})$/.exec(String(id || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    return year >= 2026 && year <= 2200 && month >= 1 && month <= 12 ? { year, month } : null;
  }

  // Molduras do ano corrente + laços conquistados em anos anteriores.
  function getDefinitions({ now = new Date(), unlockedIds = [] } = {}) {
    const year = now.getFullYear();
    const lacos = Array.from({ length: 12 }, (_, index) => lacoDefinition(year, index + 1));
    const previous = [...new Set(unlockedIds)]
      .map(parseLacoId)
      .filter(item => item && item.year < year)
      .sort((a, b) => b.year - a.year || a.month - b.month)
      .map(item => lacoDefinition(item.year, item.month));
    const anuais = Array.from({ length: ANUAL_TIERS.length }, (_, index) => anualDefinition(year, index + 1));
    const previousAnuais = [...new Set(unlockedIds)]
      .map(parseAnualId)
      .filter(item => item && item.year < year)
      .sort((a, b) => b.year - a.year || a.tier - b.tier)
      .map(item => anualDefinition(item.year, item.tier));
    return [...anuais, ...previousAnuais, ...STATIC_DEFINITIONS, ...lacos, ...previous];
  }
  function getDefinition(id) {
    const fixed = STATIC_DEFINITIONS.find(item => item.id === id);
    if (fixed) return fixed;
    const laco = parseLacoId(id);
    if (laco) return lacoDefinition(laco.year, laco.month);
    const anual = parseAnualId(id);
    return anual ? anualDefinition(anual.year, anual.tier) : null;
  }
  function isCatalogFrame(id) { return Boolean(getDefinition(id)); }

  function buildSvg(id) {
    const definition = getDefinition(id);
    if (!definition) return '';
    // Todas brilham como o Pulso Neon; a iridescente já tem o próprio brilho.
    const classes = ['profile-frame-svg', 'pf-catalog', definition.iridescent ? 'pf-iridescent' : 'pf-glow'].join(' ');
    const art = definition.svg(definition.colors);
    // Gradientes (<defs>) precisam vir antes; a luz entra logo depois, por baixo do desenho.
    const defsEnd = art.indexOf('</defs>');
    const lit = defsEnd >= 0
      ? art.slice(0, defsEnd + 7) + lightingLayer(definition.colors, lightRadiusFor(definition)) + art.slice(defsEnd + 7)
      : lightingLayer(definition.colors, lightRadiusFor(definition)) + art;
    return `<svg class="${classes}" viewBox="0 0 160 160" aria-hidden="true">${lit}</svg>`;
  }

  // --- Progresso e regras ---------------------------------------------------

  function createProgress() {
    return { version: 1, unlocked: {}, answeredIds: [], curatedIds: [], neuroIds: [], monthAnswered: {}, activeDays: [], bestStreak: 0, comboRun: 0, bestCombo: 0, legacySeen: null, retroGiftShown: false };
  }
  const cleanIds = value => (Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].slice(-MAX_TRACKED_IDS) : []);
  function normalizeProgress(value) {
    const progress = value && typeof value === 'object' ? value : {};
    const unlocked = {};
    Object.entries(progress.unlocked && typeof progress.unlocked === 'object' ? progress.unlocked : {}).forEach(([id, at]) => {
      if (isCatalogFrame(id)) unlocked[id] = Number(at) || 0;
    });
    const monthAnswered = {};
    Object.entries(progress.monthAnswered && typeof progress.monthAnswered === 'object' ? progress.monthAnswered : {}).forEach(([month, ids]) => {
      if (/^\d{4}-\d{2}$/.test(month)) monthAnswered[month] = cleanIds(ids);
    });
    const days = Array.isArray(progress.activeDays) ? [...new Set(progress.activeDays.map(String).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort().slice(-MAX_TRACKED_DAYS) : [];
    const whole = number => Math.max(0, Math.floor(Number(number) || 0));
    return {
      version: 1, unlocked, monthAnswered, activeDays: days,
      answeredIds: cleanIds(progress.answeredIds), curatedIds: cleanIds(progress.curatedIds), neuroIds: cleanIds(progress.neuroIds),
      bestStreak: whole(progress.bestStreak), comboRun: whole(progress.comboRun), bestCombo: whole(progress.bestCombo),
      // Louros/Pulso Neon já vistos (null = ainda não inicializado) e se o
      // presente retroativo já foi apresentado ao estudante.
      legacySeen: Array.isArray(progress.legacySeen) ? [...new Set(progress.legacySeen.map(String).filter(id => /^(laurel-(?:[1-9]|1[0-2])|neon)$/.test(id)))] : null,
      retroGiftShown: progress.retroGiftShown === true
    };
  }
  const addId = (list, id) => (list.includes(id) ? list : [...list, id].slice(-MAX_TRACKED_IDS));

  function dayNumber(dayKey) {
    const [year, month, day] = String(dayKey).split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, day) / 86400000);
  }
  function longestStreak(days) {
    let best = 0;
    let run = 0;
    let previous = null;
    [...days].sort().forEach(day => {
      const current = dayNumber(day);
      run = previous !== null && current - previous === 1 ? run + 1 : (previous === current ? run : 1);
      previous = current;
      best = Math.max(best, run);
    });
    return best;
  }
  function recordActiveDay(value, dayKey) {
    const progress = normalizeProgress(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey)) || progress.activeDays.includes(dayKey)) return progress;
    progress.activeDays = [...progress.activeDays, dayKey].sort().slice(-MAX_TRACKED_DAYS);
    progress.bestStreak = Math.max(progress.bestStreak, longestStreak(progress.activeDays));
    return progress;
  }
  // Cada questão conta uma vez por métrica (no mês, para os laços), para que
  // repetir a mesma pergunta não libere molduras.
  function recordQuizAnswer(value, { questionId, correct = false, curated = false, neuro = false, dayKey } = {}) {
    let progress = normalizeProgress(value);
    const id = String(questionId || '');
    if (!id) return progress;
    progress.answeredIds = addId(progress.answeredIds, id);
    if (curated) progress.curatedIds = addId(progress.curatedIds, id);
    if (neuro) progress.neuroIds = addId(progress.neuroIds, id);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) {
      const month = String(dayKey).slice(0, 7);
      progress.monthAnswered[month] = addId(progress.monthAnswered[month] || [], id);
      progress = recordActiveDay(progress, dayKey);
    }
    progress.comboRun = correct ? progress.comboRun + 1 : 0;
    progress.bestCombo = Math.max(progress.bestCombo, progress.comboRun);
    return progress;
  }

  // Preenche o progresso com o que o estudante já fez antes das molduras:
  // questões respondidas, da curadoria, de Sistema Nervoso e os eventos datados
  // de quiz/flashcard guardados pela gamificação ("AAAA-MM-DD:tipo:id").
  function backfillProgress(value, { answeredIds = [], curatedIds = [], neuroIds = [], eventIds = [], bestCombo = 0 } = {}) {
    let progress = normalizeProgress(value);
    answeredIds.forEach(id => { progress.answeredIds = addId(progress.answeredIds, String(id)); });
    curatedIds.forEach(id => { progress.curatedIds = addId(progress.curatedIds, String(id)); });
    neuroIds.forEach(id => { progress.neuroIds = addId(progress.neuroIds, String(id)); });
    eventIds.forEach(eventId => {
      const match = /^(\d{4}-\d{2}-\d{2}):([a-z]+):(.+)$/.exec(String(eventId));
      if (!match) return;
      const [, dayKey, kind, encodedId] = match;
      progress = recordActiveDay(progress, dayKey);
      if (kind !== 'quiz') return;
      let questionId = encodedId;
      try { questionId = decodeURIComponent(encodedId); } catch (error) {}
      const month = dayKey.slice(0, 7);
      progress.monthAnswered[month] = addId(progress.monthAnswered[month] || [], questionId);
    });
    progress.bestCombo = Math.max(progress.bestCombo, Math.max(0, Math.floor(Number(bestCombo) || 0)));
    return progress;
  }

  const formatNumber = number => Number(number).toLocaleString('pt-BR');
  // Entrega única para quem já usava o app quando as molduras surgiram: os
  // laços de meses já encerrados deste ano podem ser concedidos pelo histórico.
  const RETROACTIVE_YEAR = 2026;
  function evaluate(definition, metrics = {}, progress = createProgress(), now = new Date(), { retroactive = false } = {}) {
    if (!definition) return { unlocked: false, requirement: 'Esta moldura ainda não está disponível.' };
    const alreadyUnlocked = Boolean(progress.unlocked && progress.unlocked[definition.id]);
    const rule = definition.rule;
    const value = key => Math.max(0, Number(metrics[key]) || 0);
    let met = false;
    let requirement = '';
    switch (rule.type) {
      case 'level':
        met = value('level') >= rule.min;
        requirement = `Chegue ao nível ${rule.min} de XP. Você está no nível ${value('level')}.`;
        break;
      case 'streak':
        met = value('bestStreak') >= rule.min;
        requirement = `Estude ${rule.min} dias seguidos. Sua melhor sequência: ${value('bestStreak')} dia(s).`;
        break;
      case 'combo':
        met = value('bestCombo') >= rule.min;
        requirement = `Acerte ${rule.min} questões seguidas no quiz. Seu recorde: ${value('bestCombo')}.`;
        break;
      case 'challengerVotes':
        met = value('challengerVotes') >= rule.min;
        requirement = `Receba ${rule.min} votos positivos como desafiador nos duelos. Você tem ${value('challengerVotes')}.`;
        break;
      case 'neuroAnswered':
        met = value('neuroAnswered') >= rule.min;
        requirement = `Responda ${rule.min} questões de Sistema Nervoso. Você respondeu ${value('neuroAnswered')}.`;
        break;
      case 'answered':
        met = value('answered') >= rule.min;
        requirement = `Responda ${formatNumber(rule.min)} questões diferentes. Você respondeu ${formatNumber(value('answered'))}.`;
        break;
      case 'curatedAnswered':
        met = value('curatedAnswered') >= rule.min;
        requirement = `Responda ${formatNumber(rule.min)} questões da curadoria da sua faculdade. Você respondeu ${formatNumber(value('curatedAnswered'))}.`;
        break;
      case 'yearAnswered': {
        const count = (metrics.yearAnswered && Number(metrics.yearAnswered[rule.year])) || 0;
        const currentYear = now.getFullYear();
        met = currentYear === rule.year && count >= rule.min;
        requirement = currentYear < rule.year
          ? `Disponível em ${rule.year}: responda ${formatNumber(rule.min)} questões diferentes durante o ano.`
          : currentYear === rule.year
            ? `Só em ${rule.year}: responda ${formatNumber(rule.min)} questões diferentes até 31/12. Você respondeu ${formatNumber(count)}.`
            : `Ano encerrado. Esta moldura só podia ser conquistada em ${rule.year}.`;
        break;
      }
      case 'monthAnswered': {
        const monthKey = `${rule.year}-${String(rule.month).padStart(2, '0')}`;
        const count = (metrics.monthAnswered && Number(metrics.monthAnswered[monthKey])) || 0;
        const current = now.getFullYear() * 12 + now.getMonth();
        const target = rule.year * 12 + (rule.month - 1);
        const retroEligible = retroactive && rule.year === RETROACTIVE_YEAR && target <= current;
        met = (current === target || retroEligible) && count >= rule.min;
        requirement = current < target
          ? `Disponível em ${definition.title}: responda ${rule.min} questões durante o mês da campanha (${definition.theme}).`
          : current === target
            ? `Responda ${rule.min} questões diferentes neste mês da campanha (${definition.theme}). Você respondeu ${count}.`
            : `Campanha encerrada. Este laço era conquistado respondendo ${rule.min} questões no mês.`;
        break;
      }
      default:
        requirement = 'Esta moldura ainda não está disponível.';
    }
    return { unlocked: alreadyUnlocked || met, requirement: alreadyUnlocked ? `Conquistada. ${requirement}` : requirement };
  }

  // Marca como conquistadas as molduras cujo critério foi atingido agora; a
  // conquista fica gravada mesmo que a métrica caia depois (ex.: XP perdido).
  function collectNewUnlocks(value, metrics, now = new Date(), { retroactive = false } = {}) {
    const progress = normalizeProgress(value);
    const newlyUnlocked = getDefinitions({ now, unlockedIds: Object.keys(progress.unlocked) })
      .filter(definition => !progress.unlocked[definition.id] && evaluate(definition, metrics, progress, now, { retroactive }).unlocked)
      .map(definition => definition.id);
    newlyUnlocked.forEach(id => { progress.unlocked[id] = now.getTime(); });
    return { progress, newlyUnlocked };
  }

  function metricsFromProgress(progress, extra = {}) {
    const normalized = normalizeProgress(progress);
    const monthAnswered = {};
    Object.entries(normalized.monthAnswered).forEach(([month, ids]) => { monthAnswered[month] = ids.length; });
    const yearIds = {};
    Object.entries(normalized.monthAnswered).forEach(([month, ids]) => {
      const year = month.slice(0, 4);
      yearIds[year] = yearIds[year] || new Set();
      ids.forEach(id => yearIds[year].add(id));
    });
    const yearAnswered = {};
    Object.entries(yearIds).forEach(([year, ids]) => { yearAnswered[year] = ids.size; });
    return {
      level: 1, challengerVotes: 0, ...extra,
      answered: Math.max(Number(extra.answered) || 0, normalized.answeredIds.length),
      neuroAnswered: Math.max(Number(extra.neuroAnswered) || 0, normalized.neuroIds.length),
      curatedAnswered: normalized.curatedIds.length,
      bestStreak: normalized.bestStreak,
      bestCombo: normalized.bestCombo,
      monthAnswered,
      yearAnswered
    };
  }

  return {
    FAMILIES, LACO_MIN_ANSWERS, ANUAL_TIERS,
    getDefinitions, getDefinition, isCatalogFrame, buildSvg, buildLegacySvg,
    RETROACTIVE_YEAR,
    createProgress, normalizeProgress, recordActiveDay, recordQuizAnswer, longestStreak, backfillProgress,
    evaluate, collectNewUnlocks, metricsFromProgress
  };
});
