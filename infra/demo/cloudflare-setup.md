# Deploy seguro do demo.bagre.dev (Cloudflare + origem :8443) — tudo grátis

A demo roda isolada no próprio nginx em `:8443` (porta livre no host) e fica atrás
do Cloudflare. Faça nesta ordem.

## 0. Swap na VPS (rede de segurança de memória)

A VPS tem ~4 GB livres e **nenhum swap**; a demo cabe, mas sem swap um pico pode
acionar o OOM-killer. Há 72 GB de disco livres. Crie 4 GB de swap:

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

## 1. DNS com proxy

Em **DNS → Records**: `A` `demo` → `<IP-DA-VPS>`, **Proxy = Proxied (laranja)**.
Esconde o IP, ativa DDoS/CDN/WAF.

## 2. TLS de origem (Origin Certificate, grátis)

1. **SSL/TLS → Overview → Full (strict).**
2. **SSL/TLS → Origin Server → Create Certificate** (RSA, 15 anos), inclua `demo.bagre.dev`.
3. Na VPS (caminhos batem com o compose):
   ```
   sudo mkdir -p /etc/ssl/bagre-demo
   sudo tee /etc/ssl/bagre-demo/origin.pem   # cole o certificado
   sudo tee /etc/ssl/bagre-demo/origin.key   # cole a chave privada
   sudo chmod 600 /etc/ssl/bagre-demo/*
   ```

## 3. Origin Rule — conectar na origem em :8443 (essencial)

No plano grátis o Cloudflare conecta na origem na mesma porta do visitante (443).
Como a demo escuta em **8443**, crie uma regra de reescrita de porta:

**Rules → Origin Rules → Create rule**:
- **If** Hostname equals `demo.bagre.dev`
- **Then → Rewrite to → Destination Port = `8443`**

Assim o visitante usa `https://demo.bagre.dev` normal e o Cloudflare fala com a
origem em `<IP-DA-VPS>:8443`.

## 4. Proteções de borda grátis

- **Security → Bots → Bot Fight Mode: On.**
- **Security → WAF → Managed rules:** ative o **Cloudflare Free Managed Ruleset**.
- **Security → Settings → Security Level: Medium/High** e **Always Use HTTPS: On**.

## 5. Regra de rate limiting grátis (1 incluída no plano Free)

**Security → WAF → Rate limiting rules → Create**:
- **If** URI Path equals `/api/auth/login`
- **Then** ao exceder **10 req / 1 min** por IP → **Block** (10 min).

## 6. Travar a :8443 só para o Cloudflare (importante)

A `:8443` é publicada pelo Docker em `0.0.0.0` e **fura o UFW** (vai na cadeia
DOCKER). Restrinja na cadeia DOCKER-USER para só faixas do Cloudflare alcançarem:

```bash
# bloqueia 8443 por padrão; depois libera as faixas do Cloudflare
sudo iptables -I DOCKER-USER -p tcp --dport 8443 -j DROP
for cidr in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
  sudo iptables -I DOCKER-USER -p tcp --dport 8443 -s "$cidr" -j ACCEPT
done
# persistir: sudo apt install iptables-persistent && sudo netfilter-persistent save
```

Alternativa mais robusta: **Authenticated Origin Pulls** (SSL/TLS → Origin Server →
Authenticated Origin Pulls) + `ssl_verify_client on` no nginx — só o Cloudflare,
com cert cliente, fala com a origem. Ou descomente o `if ($http_cf_connecting_ip…)`
no `nginx-demo.bagre.dev.conf`.

UFW geral (higiene, sem mexer no que já roda):
```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

## Resumo das camadas (todas R$0)

| Camada | Onde | Protege |
|---|---|---|
| Proxy + DDoS + esconde IP | Cloudflare (laranja) | volume / origem |
| WAF + Bot Fight | Cloudflare | exploits / bots |
| Rate limit no login | Cloudflare + nginx + app | brute force |
| TLS Full strict + AOP / IP allowlist | Cloudflare + nginx + DOCKER-USER | sniffing / bypass de origem |
| nginx interno (headers, limites) | demo-nginx | abuso de request |
| Isolamento de containers | docker-compose.demo.vps.yml | blast-radius / host |
| DEMO_MODE (anti-SSRF) + reset diário | app | pivô / persistência |
| Swap | VPS | estabilidade sob pico |
