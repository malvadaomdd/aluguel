// Configuração pública fornecida pelo responsável; não inclui senha PostgreSQL nem chave de serviço.
window.RENTAL_CONFIG = Object.freeze({
  // Endereço público do projeto usado pelo Auth, Storage e Edge Functions.
  url: "https://hakmuaqybexmukdjgnzx.supabase.co",
  // Publishable key identifica o cliente; não concede acesso administrativo ou ignora permissões.
  key: "sb_publishable_XCWMwDvpYqr04QUw68fuPw_5AE4qL7k",
  // Seleciona a função que verifica JWT, autorização e pagamentos pelo servidor.
  functionName: "rental-api"
// Impede alterações acidentais da configuração durante a execução.
});
