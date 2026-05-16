import PageHeader from '../components/PageHeader.jsx';

export default function IntegrationDocs() {
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Integrações & API"
        description="Como atualizar o IPAM automaticamente a partir de scanners, ferramentas de monitoramento e pipelines de descoberta (Prometheus, OTEL, scripts próprios)."
      />

      <Section title="1. Health-check">
        <pre className="code">curl http://localhost:3001/api/health</pre>
      </Section>

      <Section title="2. Métricas Prometheus (/metrics)">
        <p>
          O endpoint <code>/metrics</code> expõe um snapshot do uso do
          endereçamento. Adicione o seguinte ao seu <code>prometheus.yml</code>:
        </p>
        <pre className="code">{`scrape_configs:
  - job_name: 'bagre'
    metrics_path: /metrics
    static_configs:
      - targets: ['bagre-api:3001']`}</pre>
        <p className="mt-2">Métricas expostas:</p>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>
            <code>bagre_ip_count{`{status,site,subnet}`}</code> — contagem por status
          </li>
          <li>
            <code>bagre_subnet_utilization_ratio{`{site,subnet}`}</code> — uso de cada subnet (0..1)
          </li>
          <li>
            <code>bagre_subnet_total</code>, <code>bagre_site_total</code>
          </li>
          <li>Métricas padrão do processo Node (CPU, heap, GC etc.)</li>
        </ul>
      </Section>

      <Section title="3. Ingestão automática (POST /api/ingest/discoveries)">
        <p>
          Use este endpoint para que ferramentas de monitoramento/discovery
          (nmap, prtg, zabbix, scripts ansible, OTEL collectors) atualizem o
          IPAM em lote. Auth via header <code>X-Ingest-Token</code>.
        </p>
        <pre className="code">{`curl -X POST http://localhost:3001/api/ingest/discoveries \\
  -H 'Content-Type: application/json' \\
  -H 'X-Ingest-Token: <INGEST_TOKEN>' \\
  -d '{
    "discoveries": [
      { "address": "10.150.0.10", "hostname": "srv-prd-01", "type": "Server",
        "function": "Web", "status": "USED", "source": "nmap" },
      { "address": "10.150.0.50", "hostname": "switch-core",
        "siteCode": "BAGRE-SP3", "source": "lldp" }
    ]
  }'`}</pre>
        <p className="text-sm">
          O endpoint faz <em>match por endereço</em>. Se o mesmo IP existir em
          subnets distintas, use <code>siteCode</code> ou <code>subnetCidr</code> para
          desambiguar. IPs não cadastrados retornam em <code>unmatched</code>.
        </p>
      </Section>

      <Section title="4. Heartbeat (presença/queda)">
        <p>Para registrar liveness sem mexer em metadados:</p>
        <pre className="code">{`curl -X POST http://localhost:3001/api/ingest/heartbeat \\
  -H 'Content-Type: application/json' \\
  -H 'X-Ingest-Token: <INGEST_TOKEN>' \\
  -d '{ "address": "10.150.0.10", "alive": true, "source": "blackbox-exporter" }'`}</pre>
      </Section>

      <Section title="5. Reimportar a planilha">
        <p>
          Sempre que a planilha mestre <em>Controle de IP - LAN.xlsx</em> for
          atualizada, basta regerar <code>seed.json</code> e disparar:
        </p>
        <pre className="code">{`# Local
python3 scripts/extract_xlsx.py
docker compose exec api node src/import.js /app/seed.json

# Ou via API (precisa de ADMIN_TOKEN)
curl -X POST http://localhost:3001/api/import/seed \\
  -H 'X-Admin-Token: <ADMIN_TOKEN>'`}</pre>
        <p className="text-sm">
          O importador é idempotente — atualiza linhas existentes e cria novas
          sem apagar dados manuais.
        </p>
      </Section>

      <Section title="6. Trilha de auditoria">
        <p>
          Toda alteração em IP é registrada na tabela <code>AuditLog</code>.
          Consulta direta no banco:
        </p>
        <pre className="code">{`docker compose exec db psql -U bagre -c \\
  "select created_at, actor, action, entity_id from \\\"AuditLog\\\" order by id desc limit 50;"`}</pre>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="card p-5 space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="text-sm space-y-2 [&_.code]:block [&_.code]:font-mono [&_.code]:text-xs [&_.code]:bg-slate-100 [&_.code]:dark:bg-slate-800 [&_.code]:rounded [&_.code]:p-3 [&_.code]:overflow-x-auto [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 [&_code]:dark:bg-slate-800 [&_code]:px-1 [&_code]:rounded">
        {children}
      </div>
    </section>
  );
}
