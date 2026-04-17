// ── Avant Ads — Supabase DB Layer ────────────────────────────────────────────
// Usado APENAS pelo admin. As páginas /r/ continuam usando db.js (localStorage).

const SUPABASE_URL = 'https://ildowldbpvvxustytbuy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t8-Maz88JD6DzNie8olvDQ_WTW93HRW';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DB = {

  // ── AUTH ──────────────────────────────────────────────────────────────────
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async logout() {
    await sb.auth.signOut();
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async getRole() {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.user_metadata?.role || 'colab';
  },

  async changePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  async getClientes() {
    const { data, error } = await sb
      .from('clientes')
      .select('*')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getCliente(slug) {
    const { data } = await sb.from('clientes').select('*').eq('slug', slug).single();
    return data || null;
  },

  async upsertCliente(c) {
    const { error } = await sb.from('clientes').upsert(c, { onConflict: 'slug' });
    if (error) throw error;
  },

  async deleteCliente(slug) {
    const { error } = await sb.from('clientes').delete().eq('slug', slug);
    if (error) throw error;
    // relatórios são removidos em cascata pela FK
  },

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  async getMeses(slug) {
    const { data } = await sb.from('relatorios').select('mes_ano').eq('slug', slug);
    return (data || [])
      .map(r => r.mes_ano)
      .sort((a, b) => this._mesKey(a).localeCompare(this._mesKey(b)));
  },

  async getRel(slug, mesAno) {
    const { data } = await sb
      .from('relatorios')
      .select('dados')
      .eq('slug', slug)
      .eq('mes_ano', mesAno)
      .single();
    return data?.dados || null;
  },

  async saveRel(slug, mesAno, dados) {
    const { error } = await sb.from('relatorios').upsert(
      { slug, mes_ano: mesAno, dados, updated_at: new Date().toISOString() },
      { onConflict: 'slug,mes_ano' }
    );
    if (error) throw error;
    await sb.from('clientes').update({ ultimo_mes: mesAno }).eq('slug', slug);
  },

  async deleteRel(slug, mesAno) {
    const { error } = await sb
      .from('relatorios')
      .delete()
      .eq('slug', slug)
      .eq('mes_ano', mesAno);
    if (error) throw error;
  },

  async getUltimoRel(slug) {
    const meses = await this.getMeses(slug);
    if (!meses.length) return null;
    return await this.getRel(slug, meses[meses.length - 1]);
  },

  // ── CONFIG ────────────────────────────────────────────────────────────────
  async getConfig(key, def = '') {
    const { data } = await sb.from('config').select('valor').eq('chave', key).single();
    return data?.valor || def;
  },

  async setConfig(key, val) {
    await sb.from('config').upsert({ chave: key, valor: val }, { onConflict: 'chave' });
  },

  // ── EXPORT / IMPORT ───────────────────────────────────────────────────────
  async exportAll() {
    const [{ data: clientes }, { data: relatorios }, { data: config }] = await Promise.all([
      sb.from('clientes').select('*'),
      sb.from('relatorios').select('*'),
      sb.from('config').select('*'),
    ]);
    return JSON.stringify({ clientes, relatorios, config }, null, 2);
  },

  async importAll(json) {
    const { clientes, relatorios, config } = JSON.parse(json);
    if (clientes?.length)
      await sb.from('clientes').upsert(clientes, { onConflict: 'slug' });
    if (relatorios?.length)
      await sb.from('relatorios').upsert(relatorios, { onConflict: 'slug,mes_ano' });
    if (config?.length)
      await sb.from('config').upsert(config, { onConflict: 'chave' });
  },

  // ── LINK DO CLIENTE ───────────────────────────────────────────────────────
  // Monta o payload no formato localStorage que medico.html / geral.html esperam
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
  slugify(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  },

  _mesKey(mesAno) {
    const ORDEM = ['janeiro','fevereiro','marco','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];
    const parts = mesAno.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[\/\s\-_]+/);
    const idx = ORDEM.indexOf(parts[0]);
    return (parts[1] || '0000') + '_' + String(idx < 0 ? 99 : idx).padStart(2, '0');
  },
};
