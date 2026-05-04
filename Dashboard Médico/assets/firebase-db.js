// ── Avant Ads — Firebase DB Layer ─────────────────────────────────────────────
// Usado APENAS pelo admin. As páginas /r/ continuam usando db.js (localStorage).

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDuP48Y79MsAiou1s1YWybLcGv_DKCwgyY",
  authDomain: "avant-ads-540de.firebaseapp.com",
  projectId: "avant-ads-540de",
  storageBucket: "avant-ads-540de.firebasestorage.app",
  messagingSenderId: "604959919466",
  appId: "1:604959919466:web:9e1e7006cf095b491a2913"
};

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const fdb  = firebase.firestore();

const DB = {

  // ── AUTH ──────────────────────────────────────────────────────────────────
  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return { user: cred.user };
  },

  async logout() {
    await auth.signOut();
  },

  async getRole() {
    const user = auth.currentUser;
    if (!user) return 'colab';
    try {
      const doc = await fdb.collection('users').doc(user.uid).get();
      return doc.exists ? (doc.data().role || 'admin') : 'admin';
    } catch { return 'admin'; }
  },

  async changePassword(newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error('Não autenticado');
    await user.updatePassword(newPassword);
  },

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  async getClientes() {
    const snap = await fdb.collection('clientes').orderBy('criado_em', 'desc').get();
    return snap.docs.map(d => d.data());
  },

  async getCliente(slug) {
    const doc = await fdb.collection('clientes').doc(slug).get();
    return doc.exists ? doc.data() : null;
  },

  async upsertCliente(c) {
    await fdb.collection('clientes').doc(c.slug).set(c, { merge: true });
  },

  async deleteCliente(slug) {
    const snap = await fdb.collection('relatorios').where('slug', '==', slug).get();
    const batch = fdb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(fdb.collection('clientes').doc(slug));
    await batch.commit();
  },

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  async getMeses(slug) {
    const snap = await fdb.collection('relatorios').where('slug', '==', slug).get();
    return snap.docs
      .map(d => d.data().mes_ano)
      .sort((a, b) => this._mesKey(a).localeCompare(this._mesKey(b)));
  },

  async getRel(slug, mesAno) {
    const doc = await fdb.collection('relatorios').doc(this._relId(slug, mesAno)).get();
    return doc.exists ? doc.data().dados : null;
  },

  async saveRel(slug, mesAno, dados) {
    await fdb.collection('relatorios').doc(this._relId(slug, mesAno)).set({
      slug, mes_ano: mesAno, dados,
      updated_at: new Date().toISOString()
    });
    await fdb.collection('clientes').doc(slug).update({ ultimo_mes: mesAno });
  },

  async deleteRel(slug, mesAno) {
    await fdb.collection('relatorios').doc(this._relId(slug, mesAno)).delete();
  },

  async getUltimoRel(slug) {
    const meses = await this.getMeses(slug);
    return meses.length ? await this.getRel(slug, meses[meses.length - 1]) : null;
  },

  // ── CONFIG ────────────────────────────────────────────────────────────────
  async getConfig(key, def = '') {
    const doc = await fdb.collection('config').doc(key).get();
    return doc.exists ? (doc.data().valor || def) : def;
  },

  async setConfig(key, val) {
    await fdb.collection('config').doc(key).set({ valor: val });
  },

  // ── EXPORT / IMPORT ───────────────────────────────────────────────────────
  async exportAll() {
    const [cliSnap, relSnap, cfgSnap] = await Promise.all([
      fdb.collection('clientes').get(),
      fdb.collection('relatorios').get(),
      fdb.collection('config').get(),
    ]);
    return JSON.stringify({
      clientes:   cliSnap.docs.map(d => d.data()),
      relatorios: relSnap.docs.map(d => d.data()),
      config:     cfgSnap.docs.map(d => ({ chave: d.id, valor: d.data().valor })),
    }, null, 2);
  },

  async importAll(json) {
    const { clientes = [], relatorios = [], config = [] } = JSON.parse(json);
    // Firestore batch suporta até 500 ops — divide se necessário
    const ops = [];
    clientes.forEach(c => ops.push(['clientes', c.slug, c]));
    relatorios.forEach(r => ops.push(['relatorios', this._relId(r.slug, r.mes_ano), r]));
    config.forEach(c => ops.push(['config', c.chave, { valor: c.valor }]));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fdb.batch();
      ops.slice(i, i + 400).forEach(([col, id, data]) => {
        batch.set(fdb.collection(col).doc(id), data, { merge: true });
      });
      await batch.commit();
    }
  },

  // ── LINK DO CLIENTE ───────────────────────────────────────────────────────
  async buildClientLinkData(slug) {
    const PFX = 'avant2_';
    const allData = {};

    const clientes = await this.getClientes();
    allData[PFX + 'clientes'] = JSON.stringify(
      clientes.map(c => ({
        nome: c.nome, slug: c.slug, tpl: c.tpl,
        seg: c.seg, obs: c.obs,
        criadoEm: c.criado_em, ultimoMes: c.ultimo_mes,
      }))
    );

    const meses = await this.getMeses(slug);
    for (const m of meses) {
      const dados = await this.getRel(slug, m);
      if (dados) {
        const key = PFX + 'rel_' + slug + '_' + m.trim().replace(/\s*\/\s*/, '_');
        allData[key] = JSON.stringify({ ...dados, slug, mesAno: m });
      }
    }
    return allData;
  },

  // ── UTILS ─────────────────────────────────────────────────────────────────
  _relId(slug, mesAno) {
    const m = mesAno.trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s*\/\s*/g, '-')
      .toLowerCase();
    return slug + '__' + m;
  },

  slugify(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  },

  _mesKey(mesAno) {
    const ORDEM = ['janeiro','fevereiro','marco','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];
    const parts = mesAno.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[\/\s\-_]+/);
    const idx = ORDEM.indexOf(parts[0]);
    return (parts[1] || '0000') + '_' + String(idx < 0 ? 99 : idx).padStart(2, '0');
  },
};
