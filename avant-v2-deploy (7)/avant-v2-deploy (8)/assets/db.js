const DB = {
  PFX: 'avant2_',

  getClientes() {
    return JSON.parse(localStorage.getItem(this.PFX + 'clientes') || '[]');
  },
  saveClientes(list) {
    localStorage.setItem(this.PFX + 'clientes', JSON.stringify(list));
  },
  getCliente(slug) {
    return this.getClientes().find(c => c.slug === slug) || null;
  },
  upsertCliente(c) {
    const list = this.getClientes();
    const i = list.findIndex(x => x.slug === c.slug);
    if (i >= 0) list[i] = { ...list[i], ...c };
    else list.push(c);
    this.saveClientes(list);
  },
  deleteCliente(slug) {
    this.saveClientes(this.getClientes().filter(c => c.slug !== slug));
    Object.keys(localStorage).filter(k => k.startsWith(this.PFX + 'rel_' + slug + '_')).forEach(k => localStorage.removeItem(k));
  },
  relKey(slug, mes) {
    return this.PFX + 'rel_' + slug + '_' + mes.trim().replace(/\s*\/\s*/, '_');
  },
  getRel(slug, mes) {
    const r = localStorage.getItem(this.relKey(slug, mes));
    return r ? JSON.parse(r) : null;
  },
  saveRel(slug, mes, data) {
    localStorage.setItem(this.relKey(slug, mes), JSON.stringify({ ...data, slug, mesAno: mes, updatedAt: new Date().toISOString() }));
    const cli = this.getCliente(slug) || {};
    this.upsertCliente({ ...cli, slug, ultimoMes: mes });
  },
  getMeses(slug) {
    const pfx = this.PFX + 'rel_' + slug + '_';
    return Object.keys(localStorage).filter(k => k.startsWith(pfx))
      .map(k => k.replace(pfx, '').replace('_', '/').trim()).sort();
  },
  getUltimoRel(slug) {
    const meses = this.getMeses(slug);
    return meses.length ? this.getRel(slug, meses[meses.length - 1]) : null;
  },
  deleteRel(slug, mes) { localStorage.removeItem(this.relKey(slug, mes)); },
  slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  },
  exportAll() {
    const o = {};
    Object.keys(localStorage).filter(k => k.startsWith(this.PFX)).forEach(k => o[k] = localStorage.getItem(k));
    return JSON.stringify(o, null, 2);
  },
  importAll(json) {
    Object.entries(JSON.parse(json)).forEach(([k, v]) => localStorage.setItem(k, v));
  },
  getConfig(key, def = '') {
    return localStorage.getItem(this.PFX + 'cfg_' + key) || def;
  },
  setConfig(key, val) {
    localStorage.setItem(this.PFX + 'cfg_' + key, val);
  }
};
