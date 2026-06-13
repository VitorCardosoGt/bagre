# Deploy seguro do demo.bagre.dev via Cloudflare Tunnel (tudo grátis)

A demo fica atrás do Cloudflare **sem abrir nenhuma porta** na VPS — o `cloudflared`
faz uma conexão de saída. Zero conflito com outros serviços do host, zero
certificado de origem, zero exposição. Faça nesta ordem.

## 0. (Recomendado) Swap na VPS — rede de segurança de memória

A VPS tem ~4 GB livres e **nenhum swap**; a demo cabe, mas sem swap um pico pode
acionar o OOM-killer. Há 72 GB de disco livres — sobra. Crie 4 GB de swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
free -h   # confirmar
```

## 1. Criar o Tunnel no Cloudflare (Zero Trust)

1. Cloudflare → **Zero Trust** (gratuito) → **Networks → Tunnels → Create a tunnel**.
2. Tipo **Cloudflared**, dê um nome (ex.: `bagre-demo`). Copie o **token** exibido.
3. Na VPS, coloque o token no `.env` do projeto:
   ```
   TUNNEL_TOKEN=eyJ... (o token completo)
   ```
4. Ainda no painel do tunnel, em **Public Hostnames → Add a public hostname**:
   - **Subdomain:** `demo`  **Domain:** `bagre.dev`
   - **Service:** `HTTP`  →  `demo-nginx:80`
   (O Cloudflare cria sozinho o registro DNS de `demo.bagre.dev`, já proxied.)

Subir a stack (`docker compose ... -f docker-compose.demo.vps.yml up -d`) liga o túnel.

## 2. Proteções de borda grátis (liga e esquece)

- **SSL/TLS → Overview → Full (strict)** (o túnel já é cifrado).
- **Security → Bots → Bot Fight Mode: On.**
- **Security → WAF → Managed rules:** ative o **Cloudflare Free Managed Ruleset**.
- **Security → Settings → Security Level: Medium/High** e **Always Use HTTPS: On**.

## 3. Regra de rate limiting grátis (1 incluída no plano Free)

**Security → WAF → Rate limiting rules → Create**:
- **If** URI Path equals `/api/auth/login`
- **Then** ao exceder **10 requisições / 1 min** por IP → **Block** (10 min).

Gaste a regra grátis no login (alvo de brute force); nginx e app cobrem o resto.

## 4. Firewall do host (higiene — a demo não expõe nada)

Como nada da demo é publicado, não há porta nova a proteger. Mantenha o UFW só
com o essencial (sem mexer no que os outros serviços já usam):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

⚠️ Lembrete: portas publicadas por containers em `0.0.0.0` furam o UFW (vão na
cadeia DOCKER). A demo evita isso por completo — não publica nenhuma porta.

## Resumo das camadas (todas R$0)

| Camada | Onde | Protege |
|---|---|---|
| Tunnel (sem porta aberta) | cloudflared | exposição / conflito de porta |
| Proxy + DDoS + esconde IP | Cloudflare (laranja) | volume / origem |
| WAF + Bot Fight | Cloudflare | exploits / bots |
| Rate limit no login | Cloudflare + nginx + app | brute force |
| nginx interno (headers, limites) | demo-nginx | abuso de request |
| Isolamento de containers | docker-compose.demo.vps.yml | blast-radius / host |
| DEMO_MODE (anti-SSRF) + reset diário | app | pivô / persistência |
| Swap | VPS | estabilidade sob pico |
