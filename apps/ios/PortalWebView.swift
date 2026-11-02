// Integra WebKit, navegação e compartilhamento nativo de comprovantes.
import SwiftUI
// Executa o portal dentro de um navegador com cookies persistentes.
import WebKit
// Abre provedores externos e apresenta as opções de compartilhar do iOS.
import UIKit
// Mantém o portal na origem configurada e pagamentos externos no Safari.
struct PortalWebView: UIViewRepresentable {
// Conserva a origem HTTPS validada na tela anterior.
let portal: URL
// Atualiza progresso e documentos da interface nativa.
@ObservedObject var model: PortalModel
// Inicializa o responsável pelas decisões de navegação e download.
func makeCoordinator() -> Coordinator { Coordinator(portal: portal, model: model) }
// Cria navegador sem ponte JavaScript para funções nativas.
func makeUIView(context: Context) -> WKWebView {
// Preserva cookies e sessões pelo armazenamento padrão do WebKit.
let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
// Encaminha navegação ao coordenador e habilita voltar por gesto.
view.navigationDelegate = context.coordinator; view.allowsBackForwardNavigationGestures = true
// Evita flashes claros durante o carregamento do tema preto.
view.isOpaque = false; view.backgroundColor = UIColor(red: 0.035, green: 0.035, blue: 0.051, alpha: 1); view.scrollView.backgroundColor = view.backgroundColor
// Conecta os botões nativos e carrega somente o endereço validado.
model.webView = view; view.load(URLRequest(url: portal)); return view
// Finaliza a criação do navegador.
}
// Não recarrega formulários quando o SwiftUI atualiza o progresso.
func updateUIView(_ uiView: WKWebView, context: Context) {}
// Controla redirecionamentos e downloads sem expor a sessão a links externos.
final class Coordinator: NSObject, WKNavigationDelegate, WKDownloadDelegate {
// Define a origem confiável do portal.
let portal: URL
// Publica progresso e erros para a tela nativa.
let model: PortalModel
// Associa cada transferência a um arquivo temporário independente.
var files: [ObjectIdentifier: URL] = [:]
// Recebe origem já validada e estado da tela.
init(portal: URL, model: PortalModel) { self.portal = portal; self.model = model }
// Compara protocolo, host e porta para impedir confiança em domínios semelhantes.
private func sameOrigin(_ url: URL) -> Bool { url.scheme?.lowercased() == "https" && url.host?.lowercased() == portal.host?.lowercased() && (url.port ?? 443) == (portal.port ?? 443) }
// Valida inclusive redirecionamentos gerados pelo checkout.
func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
// Permite somente downloads blob gerados pela mesma origem do portal autenticado.
if let candidate = action.request.url, candidate.scheme == "blob", action.shouldPerformDownload, let source = URL(string: String(candidate.absoluteString.dropFirst(5))), sameOrigin(source) { decisionHandler(.download); return }
// Recusa protocolos inseguros e URLs contendo credenciais.
guard let url = action.request.url, url.scheme?.lowercased() == "https", url.user == nil, url.password == nil else { decisionHandler(.cancel); return }
// Abre destinos externos no Safari, sem compartilhar os cookies do portal.
guard sameOrigin(url) else { model.loading = false; UIApplication.shared.open(url); decisionHandler(.cancel); return }
// Permite download autenticado solicitado pela página.
if action.shouldPerformDownload { decisionHandler(.download); return }
// Converte nova aba interna em navegação na mesma janela.
if action.targetFrame == nil { webView.load(action.request); decisionHandler(.cancel); return }
// Permite navegação normal somente na origem confiável.
decisionHandler(.allow)
// Finaliza a decisão sobre o link.
}
// Baixa recibos anunciados como anexos sem perder autenticação.
func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
// Consulta o cabeçalho usado pelo servidor PHP para documentos privados.
let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
// Mantém páginas no navegador e encaminha anexos ao gerenciador de download.
decisionHandler(disposition.lowercased().contains("attachment") || !response.canShowMIMEType ? .download : .allow)
// Encerra a interpretação da resposta.
}
// Assume downloads iniciados diretamente por um link.
func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
// Assume downloads identificados pelos cabeçalhos do servidor.
func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
// Mostra progresso ao iniciar a navegação.
func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.error = nil }
// Remove o progresso quando a página estiver pronta.
func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loading = false }
// Explica falha de conexão sem mostrar URLs ou dados privados.
func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { model.loading = false; if (error as NSError).code != NSURLErrorCancelled { model.error = "Não foi possível abrir o portal. Confira o endereço e a conexão." } }
// Permite tentar novamente quando o carregamento falhar depois de iniciado.
func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { model.loading = false; model.error = "Falha de conexão. Toque em Atualizar para tentar novamente." }
// Seleciona destino temporário no armazenamento privado do próprio aplicativo.
func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
// Remove diretórios potencialmente presentes no nome informado pelo servidor.
let name = URL(fileURLWithPath: suggestedFilename).lastPathComponent
// Evita sobrescrever outros comprovantes já baixados.
let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + (name.isEmpty ? "comprovante.pdf" : name))
// Associa o arquivo à transferência antes de autorizar a gravação.
files[ObjectIdentifier(download)] = url; completionHandler(url)
// Encerra a escolha de destino.
}
// Abre o compartilhamento somente quando o documento estiver completo.
func downloadDidFinish(_ download: WKDownload) {
// Remove a associação do download concluído para liberar o estado.
guard let url = files.removeValue(forKey: ObjectIdentifier(download)) else { return }
// Publica a apresentação no ciclo principal da interface.
DispatchQueue.main.async { self.model.document = SharedDocument(url: url) }
// Finaliza a transferência concluída.
}
// Limpa documentos incompletos se a transferência falhar.
func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
// Remove somente o arquivo associado a esta transferência.
if let url = files.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: url) }
// Orienta a repetir o download sem expor o erro técnico.
DispatchQueue.main.async { self.model.error = "Não foi possível baixar o documento. Tente novamente." }
// Finaliza o tratamento de erro.
}
// Encerra o coordenador.
}
// Encerra a integração WebKit.
}
// Oferece salvar em Arquivos, imprimir e compartilhar por iniciativa do usuário.
struct DocumentShareSheet: UIViewControllerRepresentable {
// Recebe apenas o documento baixado com sessão válida.
let url: URL
// Usa o compartilhamento oficial do iOS, sem envio automático a terceiros.
func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
// Não altera documentos enquanto a folha estiver aberta.
func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
// Finaliza a folha de compartilhamento.
}
