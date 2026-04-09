# Gap 7: Production-Grade K8s Deployment and Security

## Problem Statement

Current deployment infrastructure lacks production-grade capabilities:
- No production Kubernetes deployment
- Missing secrets management and encryption
- No auto-scaling or resource management
- Incomplete security hardening
- Missing monitoring and observability

## Technical Architecture

### 1. Kubernetes Infrastructure

```yaml
# k8s/
├── base/
│   ├── namespace.yaml          # Namespace configuration
│   ├── configmaps/             # Configuration management
│   ├── secrets/                # Secret templates
│   └── rbac/                   # Role-based access control
├── applications/
│   ├── orchestrator/           # TypeScript orchestrator
│   ├── api-gateway/            # API gateway service
│   ├── python-services/        # Python microservices
│   ├── web-dashboard/          # Web UI
│   └── vscode-extension/       # Extension deployment
├── data/
│   ├── postgresql/             # Primary database
│   ├── neo4j/                  # Knowledge graph
│   ├── chroma/                 # Vector database
│   └── redis/                  # Caching
├── monitoring/
│   ├── prometheus/             # Metrics collection
│   ├── grafana/                # Dashboards
│   ├── loki/                   # Log aggregation
│   └── jaeger/                 # Distributed tracing
└── security/
    ├── network-policies/       # Network security
    ├── pod-security/           # Pod security standards
    ├── cert-manager/           # TLS certificate management
    └── external-secrets/       # External secret management
```

### 2. Security Hardening

```yaml
# Security policies and configurations
apiVersion: v1
kind: SecurityContext
spec:
  runAsNonRoot: true
  runAsUser: 10001
  fsGroup: 10001
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  seccompProfile:
    type: RuntimeDefault
```

## Implementation Plan

### Week 1: Core Infrastructure

**Day 1-2: Base Kubernetes Setup**
```yaml
# k8s/base/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: agentforge
  labels:
    name: agentforge
    security.kubernetes.io/enforce: restricted
---
# k8s/base/rbac/service-account.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: agentforge-service-account
  namespace: agentforge
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: agentforge
  name: agentforge-role
rules:
- apiGroups: [""]
  resources: ["secrets", "configmaps"]
  verbs: ["get", "list"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: agentforge-rolebinding
  namespace: agentforge
subjects:
- kind: ServiceAccount
  name: agentforge-service-account
  namespace: agentforge
roleRef:
  kind: Role
  name: agentforge-role
  apiGroup: rbac.authorization.k8s.io
```

**Day 3-4: Application Deployments**
```yaml
# k8s/applications/orchestrator/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestrator
  namespace: agentforge
  labels:
    app: orchestrator
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: orchestrator
  template:
    metadata:
      labels:
        app: orchestrator
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: agentforge-service-account
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
      containers:
      - name: orchestrator
        image: agentforge/orchestrator:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secrets
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 10001
          seccompProfile:
            type: RuntimeDefault
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/cache
      volumes:
      - name: tmp
        emptyDir: {}
      - name: cache
        emptyDir:
          sizeLimit: 1Gi
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - orchestrator
              topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: orchestrator
  namespace: agentforge
  labels:
    app: orchestrator
spec:
  selector:
    app: orchestrator
  ports:
  - port: 80
    targetPort: 3000
    name: http
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orchestrator-hpa
  namespace: agentforge
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orchestrator
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**Day 5: Database Deployments**
```yaml
# k8s/data/postgresql/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgresql
  namespace: agentforge
spec:
  serviceName: postgresql
  replicas: 3
  selector:
    matchLabels:
      app: postgresql
  template:
    metadata:
      labels:
        app: postgresql
    spec:
      securityContext:
        fsGroup: 999
      containers:
      - name: postgresql
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
          name: postgresql
        env:
        - name: POSTGRES_DB
          value: agentforge
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgresql-secrets
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgresql-secrets
              key: password
        - name: POSTGRES_REPLICATION_USER
          valueFrom:
            secretKeyRef:
              name: postgresql-secrets
              key: replication-username
        - name: POSTGRES_REPLICATION_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgresql-secrets
              key: replication-password
        volumeMounts:
        - name: postgresql-data
          mountPath: /var/lib/postgresql/data
        - name: postgresql-config
          mountPath: /etc/postgresql/postgresql.conf
          subPath: postgresql.conf
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: postgresql-config
        configMap:
          name: postgresql-config
  volumeClaimTemplates:
  - metadata:
      name: postgresql-data
    spec:
      accessModes:
      - ReadWriteOnce
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

### Week 2: Security and Secrets Management

**Day 1-2: Secrets Management**
```yaml
# k8s/security/external-secrets/secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-secret-store
  namespace: agentforge
spec:
  provider:
    vault:
      server: "https://vault.company.com"
      path: "kv"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "agentforge-role"
          serviceAccountRef:
            name: "external-secrets-sa"
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-secrets
  namespace: agentforge
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: SecretStore
  target:
    name: database-secrets
    creationPolicy: Owner
  data:
  - secretKey: url
    remoteRef:
      key: agentforge/database
      property: url
  - secretKey: username
    remoteRef:
      key: agentforge/database
      property: username
  - secretKey: password
    remoteRef:
      key: agentforge/database
      property: password
```

**Day 3-4: Network Security**
```yaml
# k8s/security/network-policies/default-deny.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: agentforge
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
# k8s/security/network-policies/allow-orchestrator.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-orchestrator
  namespace: agentforge
spec:
  podSelector:
    matchLabels:
      app: orchestrator
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgresql
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to: []  # Allow external DNS/API calls
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

**Day 5: TLS and Certificate Management**
```yaml
# k8s/security/cert-manager/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@agentforge.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
---
# k8s/security/cert-manager/certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: agentforge-tls
  namespace: agentforge
spec:
  secretName: agentforge-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - api.agentforge.com
  - dashboard.agentforge.com
  - admin.agentforge.com
```

### Week 3: Monitoring and Observability

**Day 1-2: Prometheus Setup**
```yaml
# k8s/monitoring/prometheus/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 2
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        ports:
        - containerPort: 9090
        args:
        - '--config.file=/etc/prometheus/prometheus.yml'
        - '--storage.tsdb.path=/prometheus/'
        - '--web.console.libraries=/etc/prometheus/console_libraries'
        - '--web.console.templates=/etc/prometheus/consoles'
        - '--storage.tsdb.retention.time=15d'
        - '--web.enable-lifecycle'
        - '--web.enable-admin-api'
        volumeMounts:
        - name: prometheus-config
          mountPath: /etc/prometheus
        - name: prometheus-storage
          mountPath: /prometheus
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "1000m"
      volumes:
      - name: prometheus-config
        configMap:
          name: prometheus-config
      - name: prometheus-storage
        persistentVolumeClaim:
          claimName: prometheus-storage
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s

    rule_files:
    - "/etc/prometheus/rules/*.yml"

    scrape_configs:
    - job_name: 'kubernetes-apiservers'
      kubernetes_sd_configs:
      - role: endpoints
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

    - job_name: 'agentforge-services'
      kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
          - agentforge
      relabel_configs:
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__

    alerting:
      alertmanagers:
      - static_configs:
        - targets:
          - alertmanager:9093
```

**Day 3-4: Grafana and Dashboards**
```yaml
# k8s/monitoring/grafana/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:latest
        ports:
        - containerPort: 3000
        env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: grafana-secrets
              key: admin-password
        - name: GF_USERS_ALLOW_SIGN_UP
          value: "false"
        - name: GF_INSTALL_PLUGINS
          value: "grafana-kubernetes-app"
        volumeMounts:
        - name: grafana-storage
          mountPath: /var/lib/grafana
        - name: grafana-datasources
          mountPath: /etc/grafana/provisioning/datasources
        - name: grafana-dashboards
          mountPath: /etc/grafana/provisioning/dashboards
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
      volumes:
      - name: grafana-storage
        persistentVolumeClaim:
          claimName: grafana-storage
      - name: grafana-datasources
        configMap:
          name: grafana-datasources
      - name: grafana-dashboards
        configMap:
          name: grafana-dashboards
```

**Day 5: Alerting and Incident Response**
```yaml
# k8s/monitoring/alertmanager/config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      smtp_smarthost: 'smtp.company.com:587'
      smtp_from: 'alerts@agentforge.com'

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: 'default'
      routes:
      - match:
          severity: critical
        receiver: 'critical-alerts'
      - match:
          severity: warning
        receiver: 'warning-alerts'

    receivers:
    - name: 'default'
      email_configs:
      - to: 'team@agentforge.com'
        subject: '[AgentForge] {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          {{ end }}

    - name: 'critical-alerts'
      email_configs:
      - to: 'oncall@agentforge.com'
        subject: '[CRITICAL] {{ .GroupLabels.alertname }}'
      slack_configs:
      - api_url: 'SLACK_WEBHOOK_URL'
        channel: '#alerts'
        title: 'Critical Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

    - name: 'warning-alerts'
      email_configs:
      - to: 'team@agentforge.com'
        subject: '[WARNING] {{ .GroupLabels.alertname }}'
```

## Automation and CI/CD

### GitOps Deployment
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]
    paths:
    - 'k8s/**'
    - 'services/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
      with:
        version: 'latest'
    
    - name: Configure kubectl
      run: |
        echo "${{ secrets.KUBECONFIG }}" | base64 -d > kubeconfig
        export KUBECONFIG=kubeconfig
    
    - name: Validate manifests
      run: |
        kubectl apply --dry-run=client -f k8s/
    
    - name: Deploy to staging
      run: |
        kubectl apply -f k8s/ --namespace=agentforge-staging
    
    - name: Run smoke tests
      run: |
        npm run test:smoke -- --environment=staging
    
    - name: Deploy to production
      if: success()
      run: |
        kubectl apply -f k8s/ --namespace=agentforge
    
    - name: Verify deployment
      run: |
        kubectl rollout status deployment/orchestrator -n agentforge
        kubectl rollout status deployment/api-gateway -n agentforge
```

### Infrastructure as Code
```terraform
# terraform/main.tf
provider "kubernetes" {
  config_path = "~/.kube/config"
}

provider "helm" {
  kubernetes {
    config_path = "~/.kube/config"
  }
}

# Create namespace
resource "kubernetes_namespace" "agentforge" {
  metadata {
    name = "agentforge"
    
    labels = {
      "security.kubernetes.io/enforce" = "restricted"
      "pod-security.kubernetes.io/enforce" = "restricted"
      "pod-security.kubernetes.io/audit" = "restricted"
      "pod-security.kubernetes.io/warn" = "restricted"
    }
  }
}

# Install cert-manager
resource "helm_release" "cert_manager" {
  name       = "cert-manager"
  repository = "https://charts.jetstack.io"
  chart      = "cert-manager"
  namespace  = "cert-manager"
  create_namespace = true

  set {
    name  = "installCRDs"
    value = "true"
  }
}

# Install external-secrets
resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "external-secrets"
  create_namespace = true
}
```

## Success Criteria

### Deployment Requirements
- ✅ Zero-downtime deployments with rolling updates
- ✅ Auto-scaling based on CPU/memory/custom metrics
- ✅ Multi-zone high availability
- ✅ Automated backup and disaster recovery
- ✅ Infrastructure as Code (Terraform/Helm)

### Security Requirements
- ✅ All secrets encrypted at rest and in transit
- ✅ Pod security standards enforced
- ✅ Network policies isolating services
- ✅ RBAC with principle of least privilege
- ✅ TLS termination and certificate automation

### Monitoring Requirements
- ✅ 360° observability (metrics, logs, traces)
- ✅ SLA monitoring and alerting
- ✅ Capacity planning and resource optimization
- ✅ Security monitoring and incident response
- ✅ Business metrics and KPI tracking

### Performance Requirements
- ✅ 99.9% uptime SLA
- ✅ <500ms response time (p95)
- ✅ Automatic scaling from 3 to 50+ replicas
- ✅ <30s deployment rollout time
- ✅ <5min recovery time from failures

---

**Implementation Owner**: DevOps Team + Security Team  
**Estimated Effort**: 3-4 weeks  
**Dependencies**: All other components  
**Risk Level**: High (production deployment complexity)  
**Success Metrics**: 99.9% uptime, <500ms response time, zero security incidents