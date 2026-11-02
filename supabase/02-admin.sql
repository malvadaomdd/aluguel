-- Execute depois de criar e confirmar o e-mail da conta administrativa em Authentication > Users.
INSERT INTO public.rental_admins(user_id) SELECT id FROM auth.users WHERE lower(email)='malvadao.mods345@gmail.com' AND email_confirmed_at IS NOT NULL ON CONFLICT(user_id) DO NOTHING;
-- Este SELECT deve retornar a conta autorizada; resultado vazio significa que o usuário Auth ainda não foi criado.
SELECT p.full_name,p.email FROM public.rental_profiles p JOIN public.rental_admins a ON a.user_id=p.id;
