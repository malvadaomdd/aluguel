// Define a entrada nativa do aplicativo de iPhone.
import SwiftUI
// Usa a tela integrada ao portal e mantém o tema preto aprovado.
@main struct AluguelApp: App {
// Inicializa uma janela SwiftUI independente da sessão do navegador Safari.
var body: some Scene { WindowGroup { PortalView().preferredColorScheme(.dark) } }
// Encerra a definição do aplicativo.
}
