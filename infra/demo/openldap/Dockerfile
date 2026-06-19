# Servidor LDAP de TESTE do demo — construído da imagem OFICIAL do Debian.
# slapd (OpenLDAP, software livre) com domínio corp.local, usuários de exemplo
# e overlay memberof (pra mapear grupo -> papel). Interno ao stack, sem porta
# pública. Senhas públicas de propósito (é demo).
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN set -eux; \
    echo "slapd slapd/no_configuration boolean false" | debconf-set-selections; \
    echo "slapd slapd/domain string corp.local" | debconf-set-selections; \
    echo "slapd shared/organization string Corp" | debconf-set-selections; \
    echo "slapd slapd/password1 password adminpw" | debconf-set-selections; \
    echo "slapd slapd/password2 password adminpw" | debconf-set-selections; \
    echo "slapd slapd/backend select MDB" | debconf-set-selections; \
    apt-get update; \
    apt-get install -y --no-install-recommends slapd ldap-utils; \
    rm -rf /var/lib/apt/lists/*

COPY memberof.ldif /bootstrap/memberof.ldif
COPY seed.ldif /bootstrap/seed.ldif
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 389
ENTRYPOINT ["/entrypoint.sh"]
