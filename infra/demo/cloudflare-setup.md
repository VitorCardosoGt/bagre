# Cloudflare + firewall do demo.bagre.dev (tudo grátis)

Camada de segurança de borda para a demo pública, sem custo extra (o `bagre.dev`
já está no Cloudflare). Faça nesta ordem.

## 1. DNS com proxy (a peça que mais protege)

Em **DNS → Records**:
- Adicione `A` `demo` → IP da VPS.
- **Proxy status = Proxied (nuvem laranja).** Isso esconde o IP da VPS, ativa DDoS/CDN e o WAF.

## 2. TLS de origem (grátis, modo Full strict)

1. **SSL/TLS → Overview → Full (strict).**
2. **SSL/TLS → Origin Server → Create Certificate** (padrão RSA, 15 anos). Inclua `demo.bagre.dev`.
3. Na VPS, salve os dois arquivos (modo 600):
   ```
   sudo mkdir -p /etc/nginx/ssl/demo.bagre.dev
   sudo tee /etc/nginx/ssl/demo.bagre.dev/origin.pem   # cole o certificado
   sudo tee /etc/nginx/ssl/demo.bagre.dev/origin.key   # cole a chave privada
   sudo chmod 600 /etc/nginx/ssl/demo.bagre.dev/*
   ```
   (Os caminhos batem com `nginx-demo.bagre.dev.conf`.)
4. **SSL/TLS → Edge Certificates → Always Use HTTPS: On**, **Min TLS 1.2**.

## 3. Proteções grátis (liga e esquece)

- **Security → Bots → Bot Fight Mode: On** (barra bots/scanners automáticos).
- **Security → WAF → Managed rules:** ative o **Cloudflare Free Managed Ruleset**.
- **Security → Settings → Security Level: Medium/High.**
- **Speed → Optimization → Brotli: On.**

## 4. Regra de rate limiting grátis (1 incluída no plano Free)

**Security → WAF → Rate limiting rules → Create**:
- **If** URI Path equals `/api/auth/login`
- **Then** when exceeds **10 requests / 1 min** per IP → **Block** (ou Managed Challenge), por 10 min.

Gaste a regra grátis no login (alvo de brute force). O nginx e o app já cobrem o resto em profundidade.

## 5. Travar acesso direto à origem (só o Cloudflare entra)

Sem isso, alguém que descubra o IP da VPS pula o Cloudflare. Duas opções (grátis):

- **Recomendado — Authenticated Origin Pulls (mTLS):** SSL/TLS → Origin Server → **Authenticated Origin Pulls: On**. Instale o cert cliente da Cloudflare no nginx e exija com `ssl_verify_client on;` / `ssl_client_certificate`. Aí o nginx só aceita conexões assinadas pelo Cloudflare.
- **Simples — bloqueio por header:** descomente em `nginx-demo.bagre.dev.conf` a linha
  `if ($http_cf_connecting_ip = "") { return 403; }` (recusa quem não vem do Cloudflare).

## 6. Firewall da VPS (defesa do host)

Como o `docker-compose.demo.vps.yml` prende as portas em `127.0.0.1`, elas já não
ficam públicas. Mesmo assim, deixe o UFW só com o essencial:

```
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

⚠️ **Cuidado com o Docker x UFW:** portas publicadas pelo Docker em `0.0.0.0`
**furam o UFW** (vão direto na cadeia DOCKER). Por isso prendemos em `127.0.0.1`.
Se por algum motivo alguma porta da demo ficar publicada em `0.0.0.0`, bloqueie na
cadeia DOCKER-USER (que o UFW não cobre):

```
sudo iptables -I DOCKER-USER -p tcp -m multiport --dports 3000,3001,8080,10051 ! -s 127.0.0.1 -j DROP
```

## Resumo das camadas (todas R$0)

| Camada | Onde | Protege |
|---|---|---|
| Proxy + DDoS + esconde IP | Cloudflare (laranja) | volume/origem |
| WAF + Bot Fight | Cloudflare | exploits/bots |
| Rate limit no login | Cloudflare + nginx + app | brute force |
| TLS Full strict + AOP | Cloudflare + nginx | sniffing / bypass de origem |
| Portas em localhost + UFW + DOCKER-USER | VPS | exposição / outros serviços |
| Headers + tamanho/timeout | nginx | abuso de request |
| DEMO_MODE (anti-SSRF) + reset diário | app | pivô / persistência |
