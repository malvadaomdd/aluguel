// Usa o SDK oficial no servidor, sem enviar credenciais privilegiadas ao navegador.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Gera recibos PDF pelo servidor após confirmação de pagamento.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
// Lê segredos somente do ambiente da Edge Function.
const env = (key: string) => Deno.env.get(key) || "";
// A chave de serviço é injetada pelo Supabase; nunca faz parte do pacote GitHub.
const db = createClient(env("SUPABASE_URL"), env("RENTAL_SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
// Mantém os dados públicos da proprietária consistentes nos comprovantes.
const details = ["Proprietária: Janete Nascimento Santana", "Auxílio nos recebimentos: Edson Santana de Oliveira", "Bairro: Parada Morabi", "Rua: Avenida Hélio de Oliveira", "Quadra: 306 | Lote: 06 | Número: 06", "CEP: 25265-135", "Município: Duque de Caxias", "Cidade: Rio de Janeiro"];
// Formata valores inteiros em centavos sem confiar em texto do navegador.
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) / 100);
// Não permite que erro de biblioteca exponha dados de conexão ou tokens.
const fail = (message: string) => { throw new Error(message); };
// Verifica resultados de consultas antes de usar seus dados.
function checked(result: any): any { if (result.error) fail(result.error.code === "P0001" ? result.error.message : result.error.code === "23505" ? "Já existe um cadastro, solicitação ou reserva para esta operação." : "Não foi possível concluir a operação. Confira as permissões e a configuração do serviço."); return result.data; }
// Monta CORS somente para o site configurado e para testes na própria máquina.
function cors(request: Request): HeadersInit {
  // A origem do GitHub Pages é pública; o JWT continua obrigatório nas operações privadas.
  const origin = request.headers.get("origin") || ""; let permitted = "";
  // Não aceita qualquer domínio apenas porque enviou um cabeçalho Origin.
  try { if ((env("PUBLIC_SITE_URL") && new URL(env("PUBLIC_SITE_URL")).origin === origin) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) permitted = origin; } catch { /* Configuração inválida permanece sem origem liberada. */ }
  // Libera somente cabeçalhos necessários ao SDK e às operações definidas.
  return { "Access-Control-Allow-Origin": permitted, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" };
// Finaliza as regras de CORS.
}
// Consulta o Mercado Pago com token privado e recusa falhas sem expor o corpo do provedor.
async function mp(path: string, body?: any, idempotency?: string) {
  // Confere o token antes de abrir a conexão.
  if (!env("MP_ACCESS_TOKEN")) fail("Mercado Pago ainda não configurado.");
  // Usa HTTPS e define chave de idempotência nas criações.
  const response = await fetch("https://api.mercadopago.com" + path, { method: body ? "POST" : "GET", headers: { "Authorization": "Bearer " + env("MP_ACCESS_TOKEN"), "Content-Type": "application/json", ...(idempotency ? { "X-Idempotency-Key": idempotency } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  // Não interpreta uma resposta de erro como confirmação financeira.
  if (!response.ok) fail("O Mercado Pago não concluiu a solicitação. Tente novamente.");
  // Retorna dados somente de uma resposta aceita.
  return await response.json();
// Finaliza a consulta ao provedor.
}
// Compara assinaturas em tempo constante para cadeias do mesmo tamanho.
function equal(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
// Verifica HMAC do webhook antes de consultar a transação oficial.
async function verifyWebhook(request: Request, id: string) {
  // Extrai timestamp e assinatura sem aceitar campos ausentes.
  const fields = Object.fromEntries((request.headers.get("x-signature") || "").split(",").map(v => v.trim().split("="))); const rid = request.headers.get("x-request-id") || "";
  // Bloqueia operação enquanto o segredo do webhook não estiver configurado.
  if (!env("MP_WEBHOOK_SECRET") || !id || !rid || !/^\d+$/.test(fields.ts || "") || !fields.v1) return false;
  // Cria a chave HMAC apenas em memória no servidor.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("MP_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Usa o manifesto documentado pelo Mercado Pago.
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("id:" + id.toLowerCase() + ";request-id:" + rid + ";ts:" + fields.ts + ";"));
  // Compara a representação hexadecimal recebida com a calculada.
  return equal(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""), fields.v1);
// Finaliza a validação do webhook.
}
// Confirma moeda, recebedor, valor e referência antes de dar baixa nas competências.
async function settle(id: string) {
  // Consulta pagamento e conta recebedora por canais oficiais.
  const [payment, account] = await Promise.all([mp("/v1/payments/" + encodeURIComponent(id)), mp("/users/me")]);
  // Eventos pendentes não emitem recibo nem quitam fatura.
  if (payment.status !== "approved") return { pending: true };
  // Não aceita pagamento destinado a outra conta ou moeda.
  if (payment.currency_id !== "BRL" || String(payment.collector_id) !== String(account.id)) fail("Transação divergente.");
  // A rotina SQL valida o total congelado e aplica a baixa de forma atômica.
  return checked(await db.rpc("rental_confirm_payment", { p_ref: payment.external_reference, p_mp: String(payment.id), p_amount: Math.round(Number(payment.transaction_amount) * 100), p_paid: payment.date_approved }));
// Finaliza a confirmação financeira.
}
// Consulta um recibo e valida a titularidade antes de ler dados pessoais.
async function invoiceRecord(id: number, userId?: string, admin = false) {
  // Obtém composição financeira sem expor documentos de outras contas.
  const invoice = checked(await db.from("rental_invoices").select("*").eq("id", id).single()); if (invoice.status !== "paid") fail("O recibo está disponível após a confirmação do pagamento.");
  // Recupera o vínculo do contrato e verifica o titular.
  const lease = checked(await db.from("rental_leases").select("*").eq("id", invoice.lease_id).single()); if (userId && !admin && lease.user_id !== userId) fail("Documento não encontrado.");
  // Reúne somente os dados necessários ao recibo.
  const [profile, property] = await Promise.all([db.from("rental_profiles").select("*").eq("id", lease.user_id).single(), db.from("rental_properties").select("*").eq("id", lease.property_id).single()]);
  // Mantém erros de consulta como falhas explícitas.
  return { ...invoice, user_id: lease.user_id, tenant: checked(profile).full_name, property: checked(property).name };
// Finaliza a autorização do documento.
}
// Gera documento com margem, quebra de texto e indicação de atraso.
async function receipt(record: any) {
  // Cria uma página A4 com fonte legível e compatível com o português.
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); let page = pdf.addPage([595, 842]); let y = 790;
  // Escreve linhas com quebra automática, criando outra página quando necessário.
  const write = (text: string, strong = false) => {
    // Normaliza acentos e substitui caracteres não representáveis pela fonte do recibo.
    const words = String(text || "").normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?").split(" "); let line = "";
    // Desenha uma linha somente dentro das margens da página atual.
    const draw = (value: string) => { if (y < 50) { page = pdf.addPage([595, 842]); y = 790; } page.drawText(value, { x: 50, y, size: 11, font: strong ? bold : font, color: rgb(.12, .1, .16) }); y -= 18; };
    // Divide também palavras longas, evitando que nomes ou descrições ultrapassem o papel.
    for (const word of words) { const chunks: string[] = []; let chunk = ""; for (const character of word) { if (font.widthOfTextAtSize(chunk + character, 11) > 495 && chunk) { chunks.push(chunk); chunk = character; } else chunk += character; } chunks.push(chunk); for (const part of chunks) { const next = line ? line + " " + part : part; if (font.widthOfTextAtSize(next, 11) > 495 && line) { draw(line); line = part; } else line = next; } }
    // Finaliza a linha restante sem suprimir documentos vazios ou campos opcionais.
    draw(line); y -= 2;
  // Finaliza a escrita do campo.
  };
  // Identifica documento, competência e responsáveis pelo aluguel.
  write("ALUGUEL | RECIBO DE PAGAMENTO", true); write("Recibo #" + record.id + " | Competência " + record.period); details.forEach(v => write(v)); y -= 8;
  // Usa o fuso do imóvel para classificar pagamento em atraso.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(record.paid_at)).map(p => [p.type, p.value])); const paidDate = parts.year + "-" + parts.month + "-" + parts.day; const late = paidDate > record.due;
  // Expõe as parcelas da composição e o identificador oficial da transação.
  write("Inquilino: " + record.tenant); write("Imóvel: " + record.property); write("Vencimento: " + record.due); write("Pagamento: " + new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(record.paid_at))); write("Aluguel: " + money(record.base)); write("Descontos aprovados: " + money(record.discount)); write("Adicional: " + money(record.extra)); if (record.extra_reason) write("Justificativa: " + record.extra_reason); write("Multa incluída: " + money(Math.max(0, record.paid_amount - Math.max(0, record.base + record.extra - record.discount)))); write("TOTAL PAGO: " + money(record.paid_amount), true); write(late ? "PAGAMENTO REALIZADO EM ATRASO" : "Pagamento dentro do prazo."); write("Transação Mercado Pago: " + record.mp_payment); write("Confirmação de recebimento; não substitui nota fiscal.");
  // Retorna bytes somente depois de concluir a geração do PDF.
  return await pdf.save();
// Finaliza a geração do comprovante.
}
// Restringe inscrições push aos provedores públicos conhecidos para impedir SSRF.
function validPush(data: any) {
  // Recusa nomes semelhantes, portas arbitrárias e credenciais embutidas.
  try { const u = new URL(data.endpoint); return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com" || u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.apple.com") || u.hostname.endsWith(".notify.windows.com")); } catch { return false; }
// Finaliza a validação do destino push.
}
// Processa filas sem afirmar sucesso quando a credencial SMTP ou push estiver ausente.
async function sendQueues() {
  // Limita cada execução para respeitar o tempo disponível da Edge Function.
  const notices = checked(await db.from("rental_notices").select("*").is("emailed_at", null).order("id").limit(20));
  // Configura SMTP somente quando houver uma senha de aplicativo cadastrada nos Secrets.
  if (env("SMTP_PASSWORD")) {
    // Usa a implementação SMTP sem incorporar credenciais no pacote.
    const nodemailer = (await import("npm:nodemailer@6.10.1")).default;
    // Mantém TLS e timeouts para não prender a execução indefinidamente.
    const mailer = nodemailer.createTransport({ host: env("SMTP_HOST") || "smtp.gmail.com", port: Number(env("SMTP_PORT") || 465), secure: true, auth: { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") }, connectionTimeout: 8000, socketTimeout: 10000 });
    // Envia documentos somente ao destinatário vinculado à notificação.
    for (const notice of notices) { const profile = checked(await db.from("rental_profiles").select("email").eq("id", notice.user_id).single()); const attachments: any[] = []; if (notice.dedupe.startsWith("paid:")) { const data = await receipt(await invoiceRecord(Number(notice.dedupe.slice(5)))); attachments.push({ filename: "recibo.pdf", content: data, contentType: "application/pdf" }); } await mailer.sendMail({ from: env("MAIL_FROM") || env("SMTP_USER"), to: profile.email, subject: notice.subject, text: notice.body + "\n\nAcesse " + env("PUBLIC_SITE_URL"), attachments }); checked(await db.from("rental_notices").update({ emailed_at: new Date().toISOString() }).eq("id", notice.id)); }
  // Finaliza o processamento SMTP.
  }
  // Mantém push independente da configuração de e-mail.
  if (env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")) {
    // Usa criptografia Web Push e identidade privada mantida nos Secrets.
    const push = (await import("npm:web-push@3.6.7")).default; push.setVapidDetails("mailto:" + (env("MAIL_FROM") || "malvadao.mods345@gmail.com"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
    // Seleciona avisos recentes mesmo quando e-mails já foram enviados.
    const recent = checked(await db.from("rental_notices").select("*").gte("created", new Date(Date.now() - 7 * 86400000).toISOString()).order("id").limit(30));
    // Envia um texto genérico para não revelar dívida na tela bloqueada.
    for (const notice of recent) { const subs = checked(await db.from("rental_push").select("*").eq("user_id", notice.user_id)); for (const sub of subs) { const sent = checked(await db.from("rental_push_sent").select("notice_id").eq("subscription_id", sub.id).eq("notice_id", notice.id)); if (sent.length || !validPush(sub.data)) continue; try { await push.sendNotification(sub.data, JSON.stringify({ title: "Aluguel", body: "Há uma atualização na sua conta.", tag: "aluguel-" + notice.id }), { TTL: 86400, timeout: 5000 }); checked(await db.from("rental_push_sent").insert({ subscription_id: sub.id, notice_id: notice.id })); } catch (error: any) { if (error.statusCode === 404 || error.statusCode === 410) await db.from("rental_push").delete().eq("id", sub.id); } } }
  // Finaliza o processamento push.
  }
// Finaliza o processamento das filas.
}
// Atende operações públicas limitadas, webhook assinado e solicitações autenticadas.
export async function handler(request: Request) {
  // Reutiliza cabeçalhos de privacidade em todas as respostas.
  const headers = cors(request); const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } }); if (request.method === "OPTIONS") return new Response(null, { headers });
  // Não converte erro inesperado em uma operação financeira bem-sucedida.
  try {
    // Lê a operação sem confiar em identificadores de usuário enviados no corpo.
    const url = new URL(request.url); const data = request.method === "POST" ? await request.json().catch(() => ({})) : {}; const action = url.searchParams.get("action") || data.action; const payload = data.data || {};
    // Permite ao cadastro consultar apenas disponibilidade e preços públicos.
    if (action === "availability") { const properties = checked(await db.from("rental_properties").select("*").order("id")); const leases = checked(await db.from("rental_leases").select("property_id").eq("status", "active")); return json(properties.map((p: any) => ({ ...p, occupied: leases.some((l: any) => l.property_id === p.id) }))); }
    // Webhook não usa sessão de usuário; exige assinatura do Mercado Pago.
    if (action === "webhook") { const id = url.searchParams.get("data.id") || data.data?.id || ""; if (!await verifyWebhook(request, String(id))) return json({ error: "Assinatura inválida." }, 401); const result = await settle(String(id)); return json(result); }
    // Cron não é acionável pela Publishable key ou por um visitante.
    if (action === "cron") { if (!env("RENTAL_CRON_SECRET") || !equal(request.headers.get("x-cron-secret") || "", env("RENTAL_CRON_SECRET"))) return json({ error: "Não autorizado." }, 401); checked(await db.rpc("rental_reminders")); await sendQueues(); return json({ ok: true }); }
    // Valida o JWT no servidor Auth antes de escolher a identidade da operação.
    const token = (request.headers.get("authorization") || "").replace(/^Bearer /i, ""); const auth = await db.auth.getUser(token); if (auth.error || !auth.data.user) return json({ error: "Entre novamente na sua conta." }, 401); const user = auth.data.user; if (!user.email) fail("Use uma conta de e-mail válida para administrar seu aluguel.");
    // Confere privilégio por registro administrativo, nunca por metadados do usuário.
    const admin = checked(await db.from("rental_admins").select("user_id").eq("user_id", user.id)).length > 0;
    // Obtém painel autorizado e publica somente a parte pública da identidade VAPID.
    if (action === "snapshot") return json({ ...checked(await db.rpc("rental_snapshot", { p_actor: user.id })), vapid: env("VAPID_PUBLIC_KEY") });
    // Entrega recibo autenticado sem armazenar um link público permanente.
    if (action === "receipt") { const record = await invoiceRecord(Number(payload.invoice_id), user.id, admin); return new Response((await receipt(record)).buffer as ArrayBuffer, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="recibo-' + record.id + '.pdf"' } }); }
    // Autoriza leitura de comprovante pelo titular do contrato ou administrador.
    if (action === "proof") { const credit = checked(await db.from("rental_credits").select("*").eq("id", Number(payload.credit_id)).single()); const lease = checked(await db.from("rental_leases").select("user_id").eq("id", credit.lease_id).single()); if (!admin && lease.user_id !== user.id) fail("Documento não encontrado."); const signed = checked(await db.storage.from("rental-proofs").createSignedUrl(credit.proof_path, 60)); return json({ url: signed.signedUrl }); }
    // Valida comprovante existente antes de permitir solicitação ou aprovação de desconto.
    if (action === "credit" || (action === "credit_review" && payload.status === "approved")) { let path = payload.proof_path; if (action === "credit_review") { if (!admin) fail("Ação administrativa."); path = checked(await db.from("rental_credits").select("proof_path").eq("id", Number(payload.credit_id)).single()).proof_path; } if (typeof path !== "string" || (action === "credit" && !path.startsWith(user.id + "/"))) fail("Comprovante inválido."); const file = checked(await db.storage.from("rental-proofs").download(path)); if (file.size > 8388608 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) fail("Envie PDF, JPG ou PNG de até 8 MB."); const head = new Uint8Array(await file.slice(0, 8).arrayBuffer()); const valid = (file.type === "application/pdf" && new TextDecoder().decode(head.slice(0, 5)) === "%PDF-") || (file.type === "image/jpeg" && head[0] === 255 && head[1] === 216 && head[2] === 255) || (file.type === "image/png" && head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71); if (!valid) fail("O conteúdo do arquivo não corresponde ao formato informado."); }
    // Protege o servidor contra endpoints push arbitrários.
    if (action === "push" && (!validPush(payload) || (!payload.remove && (!payload.keys?.p256dh || !payload.keys?.auth)))) fail("Inscrição de notificações inválida.");
    // Cria pagamento somente quando a integração já permite confirmar transações.
    if (action === "checkout") {
      // O site público e o segredo do webhook são obrigatórios antes de receber dinheiro.
      if (!env("MP_ACCESS_TOKEN") || !env("MP_WEBHOOK_SECRET") || !env("PUBLIC_SITE_URL").startsWith("https://")) fail("A administração precisa concluir Mercado Pago, webhook e domínio HTTPS antes de cobrar.");
      // Solicita o valor ao banco em vez de aceitar um total do navegador.
      const reference = crypto.randomUUID(); const order = checked(await db.rpc("rental_action", { p_actor: user.id, p_action: "checkout", p_data: { invoice_ids: payload.invoice_ids, checkout_id: reference } })); if (order.zero) return json(order);
      // Obtém o prazo reservado na mesma transação que congelou as faturas.
      const checkout = checked(await db.from("rental_checkouts").select("*").eq("id", reference).single());
      // Libera a reserva se o provedor recusar criar a preferência.
      try { const limit = Math.max(1, Math.min(12, Math.trunc(Number(payload.installments)) || 12)); const site = env("PUBLIC_SITE_URL"); const preference = await mp("/checkout/preferences", { items: [{ title: "Aluguel — competências selecionadas", quantity: 1, currency_id: "BRL", unit_price: order.amount / 100 }], payer: { email: user.email }, external_reference: reference, notification_url: env("SUPABASE_URL") + "/functions/v1/rental-api?action=webhook", back_urls: { success: site, pending: site, failure: site }, auto_return: "approved", payment_methods: { installments: limit }, expires: true, expiration_date_to: checkout.expires }, reference); if (!String(preference.init_point).startsWith("https://")) fail("Checkout indisponível."); checked(await db.from("rental_checkouts").update({ checkout_url: preference.init_point }).eq("id", reference)); return json({ url: preference.init_point }); } catch (error) { await db.from("rental_invoice_locks").delete().eq("checkout_id", reference); await db.from("rental_checkouts").update({ status: "failed" }).eq("id", reference); throw error; }
    // Finaliza a criação do checkout.
    }
    // Não permite que uma operação desconhecida acesse diretamente tabelas privilegiadas.
    const allowed = ["lease", "plan", "advance", "credit", "handover", "pause", "resume_request", "resume_confirm", "coupon", "coupon_create", "credit_review", "due", "handover_review", "ticket_open", "ticket_message", "ticket_status", "push"]; if (!allowed.includes(action)) fail("Operação inválida.");
    // Executa autorização e transação também no banco.
    return json(checked(await db.rpc("rental_action", { p_actor: user.id, p_action: action, p_data: payload })));
  // Retorna mensagem de operação sem serializar objetos que possam conter segredos.
  } catch (error: any) { return json({ error: typeof error?.message === "string" ? error.message : "Não foi possível concluir a operação." }, 400); }
// Encerra a função pública de atendimento.
}
// Expõe utilitários apenas para testes de código, sem endpoints adicionais.
export { verifyWebhook, receipt, validPush, equal };
