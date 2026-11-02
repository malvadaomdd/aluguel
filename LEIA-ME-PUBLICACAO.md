# Publicação no GitHub Pages

1. Envie o **conteúdo dentro da pasta ENVIAR_AO_GITHUB** para a raiz do repositório (não envie a pasta externa como uma única pasta).
2. Confirme que `.github/workflows/pages.yml` e `web/index.html` aparecem no GitHub.
3. Em Settings > Pages > Build and deployment > Source, selecione **GitHub Actions**.
4. Em Actions, abra **Publicar Aluguel no GitHub Pages** e execute **Run workflow** na branch `main`.
5. Aguarde a execução ficar verde. Confira a URL publicada na execução.

**Importante:** se o repositório se chama `malvadaomdd.github.io`, o endereço esperado é `https://malvadaomdd.github.io/`. Se tem outro nome, o endereço costuma incluir `/nome-do-repositorio/`.

O `index.html` da raiz redireciona para `web/` apenas para publicações feitas pela opção `Deploy from a branch`. No workflow oficial, o conteúdo de `web/` é publicado diretamente na raiz do site.

Atenção: a configuração pública do Supabase em `web/config.js` é diferente daquela informada anteriormente em conversa. Verifique se URL e chave pertencem ao projeto correto antes de testar login e dados.
