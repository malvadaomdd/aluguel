// Carrega a implementação verificável sem iniciar outro servidor durante importações de teste.
import { handler } from "./handler.ts";
// Inicia o atendimento no formato suportado pelo runtime Edge do Supabase.
Deno.serve(handler);
