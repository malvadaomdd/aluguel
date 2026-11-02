# Abre somente a nova interface GitHub Pages, sem usar o banco SQLite do PHP antigo.
$ErrorActionPreference='Stop'
# Resolve a pasta estática a partir da localização deste comando.
$root=$PSScriptRoot
# Explica que login, gravação e pagamentos dependem das funções já publicadas no Supabase.
Write-Host 'NOVA VERSÃO PAGES: http://127.0.0.1:8100 - requer SQL, Auth e Edge Function configurados no Supabase.'
# Usa o PHP instalado apenas como servidor de arquivos estáticos, sem publicar a pasta privada.
& 'C:\xampp\php\php.exe' -S 127.0.0.1:8100 -t "$root\web"
