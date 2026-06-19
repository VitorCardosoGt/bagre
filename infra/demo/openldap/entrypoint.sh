#!/bin/sh
# Sobe o slapd, aplica o overlay memberof e semeia usuários/grupos (idempotente).
set -e
mkdir -p /var/run/slapd
chown -R openldap:openldap /var/lib/ldap /etc/ldap/slapd.d /var/run/slapd 2>/dev/null || true

# slapd em foreground (-d 0), em background do shell, pra poder semear depois.
slapd -h "ldap:/// ldapi:///" -u openldap -g openldap -F /etc/ldap/slapd.d -d 0 &
SLAPD_PID=$!

# Espera ficar pronto.
for i in $(seq 1 30); do
  ldapsearch -Y EXTERNAL -H ldapi:/// -b cn=config -s base >/dev/null 2>&1 && break
  sleep 1
done

# Overlay memberof (ignora se já aplicado).
ldapmodify -Y EXTERNAL -H ldapi:/// -f /bootstrap/memberof.ldif >/dev/null 2>&1 || true
# Usuários/grupos (ignora se já existem).
ldapadd -x -D "cn=admin,dc=corp,dc=local" -w adminpw -f /bootstrap/seed.ldif >/dev/null 2>&1 || true

echo "[openldap] pronto — base dc=corp,dc=local · usuarios: alice (admin), bob (reader)"
wait "$SLAPD_PID"
