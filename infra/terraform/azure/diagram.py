"""
Bagre — diagrama de arquitetura Azure
Espelha exatamente os 12 recursos do main.tf

Como gerar:
    cd infra/terraform/azure
    .venv/bin/python diagram.py

Saída: ../../docs/azure-arch.png (substitui se já existir)

Quando o main.tf mudar, atualize este script e re-rode.
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.azure.general import Resourcegroups, Subscriptions
from diagrams.azure.network import VirtualNetworks, Subnets, NetworkSecurityGroupsClassic
from diagrams.azure.compute import ContainerRegistries, AppServices
from diagrams.azure.web import AppServicePlans
from diagrams.azure.database import DatabaseForPostgresqlServers
from diagrams.azure.security import KeyVaults
from diagrams.azure.storage import StorageAccounts
from diagrams.azure.analytics import LogAnalyticsWorkspaces
from diagrams.azure.devops import ApplicationInsights
from diagrams.onprem.client import Users

graph_attr = {
    "fontsize": "14",
    "bgcolor": "white",
    "pad": "0.6",
    "splines": "ortho",
    "nodesep": "0.6",
    "ranksep": "0.8",
}

with Diagram(
    "Bagre — Arquitetura Azure (futuro)",
    show=False,
    filename="../../../docs/azure-arch",
    direction="TB",
    graph_attr=graph_attr,
):
    users = Users("Usuários\nBagre")

    with Cluster("Azure Subscription · SCE-BAGRE-PROD"):
        with Cluster("rg-bagre-prod  ·  Brazil South"):

            with Cluster("vnet-bagre  ·  10.20.0.0/16"):

                with Cluster("snet-app  ·  10.20.1.0/24"):
                    nsg = NetworkSecurityGroupsClassic("nsg-app\n(allow 443 from VNet)")
                    asp = AppServicePlans("ASP B1 Linux")
                    api = AppServices("api · App Service\n(container)")
                    web = AppServices("web · App Service\n(container)")
                    api - asp
                    web - asp

                with Cluster("snet-db  ·  10.20.2.0/24"):
                    pg = DatabaseForPostgresqlServers("Postgres 15\nFlexible Server")

            acr = ContainerRegistries("ACR\nbagre-api / web")
            kv = KeyVaults("Key Vault\nsecrets")
            backup = StorageAccounts("Storage Account\npostgres-backups")

        with Cluster("Observabilidade"):
            law = LogAnalyticsWorkspaces("Log Analytics\nWorkspace")
            appi = ApplicationInsights("Application\nInsights")
            appi - law

    # Conexões — fluxo de request
    users >> Edge(label="HTTPS :443") >> web
    web >> Edge(label="proxy /api") >> api
    api >> Edge(label="TCP 5432\n(VNet privada)") >> pg

    # Secrets
    api >> Edge(label="JWT_SECRET\nDB password", style="dashed", color="darkorange") >> kv

    # Imagens
    api >> Edge(label="docker pull", style="dashed", color="darkblue") >> acr
    web >> Edge(label="docker pull", style="dashed", color="darkblue") >> acr

    # Backup
    pg >> Edge(label="auto-backup", style="dashed", color="green") >> backup

    # Telemetria
    api >> Edge(label="telemetria", style="dotted", color="purple") >> appi
    web >> Edge(label="telemetria", style="dotted", color="purple") >> appi
