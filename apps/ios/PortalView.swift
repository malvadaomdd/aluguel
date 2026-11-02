// Usa SwiftUI para configurar o domínio e apresentar o portal dentro do aplicativo.
import SwiftUI
// Usa WebKit para manter navegação e sessão de login no iPhone.
import WebKit
// Compartilha progresso e documentos sem copiar senhas do formulário.
final class PortalModel: ObservableObject {
// Indica carregamento para a interface nativa.
@Published var loading = false
// Mostra falhas de conexão e download.
@Published var error: String?
// Apresenta comprovantes concluídos na folha de compartilhamento.
@Published var document: SharedDocument?
// Referencia o navegador sem provocar ciclo de retenção.
weak var webView: WKWebView?
// Encerra a definição do estado.
}
// Identifica cada comprovante temporário independentemente do nome do arquivo.
struct SharedDocument: Identifiable {
// Evita conflitos entre recibos com nomes semelhantes.
let id = UUID()
// Aponta somente para o arquivo privado baixado com autenticação.
let url: URL
// Finaliza a definição do comprovante.
}
// Oferece configuração inicial, portal autenticado e navegação nativa.
struct PortalView: View {
// Persiste apenas o domínio, sem armazenar senha de usuário neste campo.
@AppStorage("portalURL") private var address = ""
// Preserva o estado de navegação durante atualizações da interface.
@StateObject private var model = PortalModel()
// Mostra o formulário até existir uma origem HTTPS válida.
@State private var portal: URL?
// Organiza título, progresso, navegador e comandos de acesso.
var body: some View {
// Mantém o portal sob uma barra de navegação nativa.
NavigationStack {
// Agrupa avisos e conteúdo sem cobrir os formulários da página.
VStack(spacing: 0) {
// Informa atividade enquanto uma página é carregada.
if model.loading { ProgressView().padding(8) }
// Mostra erro genérico sem expor credenciais ou conteúdo de comprovantes.
if let error = model.error { Text(error).foregroundStyle(.orange).font(.footnote).padding() }
// Exibe o navegador apenas depois da validação do endereço.
if let portal = portal { PortalWebView(portal: portal, model: model) } else {
// Mantém os campos acessíveis no celular mesmo quando o teclado estiver aberto.
ScrollView {
// Apresenta identidade, instruções e domínio do servidor.
VStack(alignment: .leading, spacing: 22) {
// Mostra a marca no tema preto e lilás.
Text("Aluguel").font(.largeTitle.bold()).foregroundStyle(.purple)
// Explica a finalidade do aplicativo.
Text("Seu espaço, tudo em dia.").font(.title2)
// Solicita endereço público em vez do localhost do computador.
Text("Informe o endereço HTTPS fornecido pela administração.")
// Preserva o endereço digitado sem correção automática.
TextField("https://seu-dominio.com", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).textFieldStyle(.roundedBorder)
// Valida a origem antes de criar o navegador.
Button("Acessar meu aluguel", action: openPortal).buttonStyle(.borderedProminent)
// Explica como retomar o portal após pagamento externo.
Text("Pagamentos podem abrir o Safari. Depois, volte e atualize as faturas para consultar a confirmação.").font(.footnote).foregroundStyle(.secondary)
// Aplica margens adequadas à tela inicial.
}.padding(28)
// Finaliza a área de configuração rolável.
}
// Finaliza a escolha entre navegador e configuração.
}
// Usa fundo escuro também durante o carregamento.
}.background(Color(red: 0.035, green: 0.035, blue: 0.051)).navigationTitle("Aluguel").navigationBarTitleDisplayMode(.inline)
// Disponibiliza voltar, atualizar e alterar endereço.
.toolbar {
// Mantém os controles ao alcance na barra inferior.
ToolbarItemGroup(placement: .bottomBar) {
// Navega para a página anterior sem recriar a sessão.
Button { model.webView?.goBack() } label: { Label("Voltar", systemImage: "chevron.left") }.disabled(portal == nil)
// Separa os comandos de navegação.
Spacer()
// Reconsulta faturas e mensagens no servidor.
Button { model.webView?.reload() } label: { Label("Atualizar", systemImage: "arrow.clockwise") }.disabled(portal == nil)
// Mantém o comando de configuração na extremidade da barra.
Spacer()
// Permite corrigir o domínio sem alterar senha de usuário.
Button { portal = nil; model.error = nil } label: { Label("Endereço", systemImage: "gearshape") }
// Finaliza os controles da barra inferior.
}
// Finaliza a configuração da barra.
}
// Usa o domínio público embutido durante a compilação quando não houver configuração local.
.onAppear { if address.isEmpty { address = Bundle.main.object(forInfoDictionaryKey: "AluguelPortalURL") as? String ?? "" }; if portal == nil && validURL() != nil { openPortal() } }
// Compartilha o documento somente após download e limpa sua cópia temporária ao fechar.
.sheet(item: $model.document) { file in DocumentShareSheet(url: file.url).onDisappear { try? FileManager.default.removeItem(at: file.url) } }
// Aplica destaque lilás aos controles nativos.
}.tint(Color(red: 0.773, green: 0.671, blue: 1))
// Finaliza o conteúdo da interface.
}
// Exige HTTPS, host presente e ausência de senha embutida no endereço.
private func validURL() -> URL? { guard let url = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty, url.user == nil, url.password == nil else { return nil }; return url }
// Mantém a configuração aberta quando o endereço for inválido.
private func openPortal() { guard let url = validURL() else { model.error = "Informe um endereço HTTPS válido."; return }; model.error = nil; portal = url }
// Encerra a tela principal.
}
